import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import db from './database.js';

// ── RP Configuration ──
const RP_NAME = 'NoteMinds';

function getRpId() {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
        const url = new URL(frontendUrl);
        const parts = url.hostname.split('.');
        // Use the base domain (e.g. loveyuna.today from noteminds.loveyuna.today)
        // This allows passkeys to work across subdomains
        if (parts.length > 2) {
            return parts.slice(-2).join('.');
        }
        return url.hostname;
    } catch {
        return 'localhost';
    }
}

function getOrigins() {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const origins = new Set();
    try {
        const url = new URL(frontendUrl);
        origins.add(url.origin);
        origins.add(`https://${url.hostname}`);
        origins.add(`http://${url.hostname}`);
        // Also add base domain origins for subdomain support
        const parts = url.hostname.split('.');
        if (parts.length > 2) {
            const baseDomain = parts.slice(-2).join('.');
            origins.add(`https://${baseDomain}`);
            origins.add(`http://${baseDomain}`);
        }
    } catch {
        origins.add('http://localhost:5173');
        origins.add('http://localhost:3001');
    }
    return [...origins];
}

// ── Challenge storage (DB-backed) ──

function saveChallenge(userId, challenge, type) {
    db.prepare(`
    INSERT OR REPLACE INTO webauthn_challenges (user_id, challenge, type, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(userId, challenge, type);
}

function getChallenge(userId, type) {
    const row = db.prepare(`
    SELECT challenge, created_at FROM webauthn_challenges WHERE user_id = ? AND type = ?
  `).get(userId, type);
    if (!row) return null;

    // Expire after 5 minutes
    const created = new Date(row.created_at + 'Z').getTime();
    if (Date.now() - created > 5 * 60 * 1000) {
        db.prepare('DELETE FROM webauthn_challenges WHERE user_id = ? AND type = ?').run(userId, type);
        return null;
    }
    return row.challenge;
}

function deleteChallenge(userId, type) {
    db.prepare('DELETE FROM webauthn_challenges WHERE user_id = ? AND type = ?').run(userId, type);
}

// ── Passkey DB helpers ──

function getUserPasskeys(userId) {
    const rows = db.prepare('SELECT * FROM passkeys WHERE user_id = ?').all(userId);
    return rows.map(r => ({
        id: r.id,
        publicKey: r.public_key,
        counter: r.counter,
        transports: r.transports ? JSON.parse(r.transports) : undefined,
        deviceType: r.device_type,
        backedUp: !!r.backed_up,
        name: r.name,
        createdAt: r.created_at,
    }));
}

function savePasskey(userId, credential, deviceType, backedUp, name) {
    db.prepare(`
    INSERT INTO passkeys (id, user_id, public_key, counter, transports, device_type, backed_up, name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
        credential.id,
        userId,
        Buffer.from(credential.publicKey),
        credential.counter,
        credential.transports ? JSON.stringify(credential.transports) : null,
        deviceType,
        backedUp ? 1 : 0,
        name || 'Passkey'
    );

    // Enable passkey_enabled flag
    db.prepare('UPDATE users SET passkey_enabled = 1, updated_at = datetime(\'now\') WHERE id = ?').run(userId);
}

function updatePasskeyCounter(credentialId, newCounter) {
    db.prepare('UPDATE passkeys SET counter = ? WHERE id = ?').run(newCounter, credentialId);
}

function deletePasskey(credentialId, userId) {
    db.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').run(credentialId, userId);

    // Check if any passkeys remain
    const remaining = db.prepare('SELECT COUNT(*) as count FROM passkeys WHERE user_id = ?').get(userId);
    if (remaining.count === 0) {
        db.prepare('UPDATE users SET passkey_enabled = 0, updated_at = datetime(\'now\') WHERE id = ?').run(userId);
    }
}

// ── Registration ──

export async function generatePasskeyRegistrationOptions(userId) {
    const user = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(userId);
    if (!user) throw new Error('Tài khoản không tồn tại');

    const userPasskeys = getUserPasskeys(userId);

    const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: getRpId(),
        userName: user.email || user.username,
        userID: new TextEncoder().encode(String(user.id)),
        attestationType: 'none',
        excludeCredentials: userPasskeys.map(pk => ({
            id: pk.id,
            transports: pk.transports,
        })),
        authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'preferred',
        },
    });

    // Save challenge
    saveChallenge(userId, options.challenge, 'registration');

    return options;
}

export async function verifyPasskeyRegistration(userId, response, passkeyName) {
    const expectedChallenge = getChallenge(userId, 'registration');
    if (!expectedChallenge) throw new Error('Phiên đăng ký đã hết hạn. Vui lòng thử lại.');

    let verification;
    try {
        verification = await verifyRegistrationResponse({
            response,
            expectedChallenge,
            expectedOrigin: getOrigins(),
            expectedRPID: getRpId(),
        });
    } catch (error) {
        throw new Error('Xác thực passkey thất bại: ' + error.message);
    }

    deleteChallenge(userId, 'registration');

    if (!verification.verified || !verification.registrationInfo) {
        throw new Error('Xác thực passkey thất bại');
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    savePasskey(userId, credential, credentialDeviceType, credentialBackedUp, passkeyName || 'Passkey');

    return {
        verified: true,
        passkey: {
            id: credential.id,
            name: passkeyName || 'Passkey',
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp,
        },
    };
}

// ── Authentication ──

export async function generatePasskeyAuthenticationOptions(userId) {
    const userPasskeys = getUserPasskeys(userId);
    if (userPasskeys.length === 0) {
        throw new Error('Tài khoản chưa có passkey nào');
    }

    const options = await generateAuthenticationOptions({
        rpID: getRpId(),
        allowCredentials: userPasskeys.map(pk => ({
            id: pk.id,
            transports: pk.transports,
        })),
    });

    saveChallenge(userId, options.challenge, 'authentication');

    return options;
}

export async function verifyPasskeyAuthentication(userId, response) {
    const expectedChallenge = getChallenge(userId, 'authentication');
    if (!expectedChallenge) throw new Error('Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.');

    const userPasskeys = getUserPasskeys(userId);
    const matchingPasskey = userPasskeys.find(pk => pk.id === response.id);
    if (!matchingPasskey) throw new Error('Passkey không tìm thấy');

    let verification;
    try {
        verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge,
            expectedOrigin: getOrigins(),
            expectedRPID: getRpId(),
            credential: {
                id: matchingPasskey.id,
                publicKey: matchingPasskey.publicKey,
                counter: matchingPasskey.counter,
                transports: matchingPasskey.transports,
            },
        });
    } catch (error) {
        throw new Error('Xác thực passkey thất bại: ' + error.message);
    }

    deleteChallenge(userId, 'authentication');

    if (!verification.verified) {
        throw new Error('Xác thực passkey thất bại');
    }

    // Update counter
    updatePasskeyCounter(response.id, verification.authenticationInfo.newCounter);

    return { verified: true };
}

// ── Management ──

export function getPasskeyList(userId) {
    return getUserPasskeys(userId).map(pk => ({
        id: pk.id,
        name: pk.name,
        deviceType: pk.deviceType,
        backedUp: pk.backedUp,
        createdAt: pk.createdAt,
    }));
}

export function removePasskey(userId, credentialId) {
    const passkey = db.prepare('SELECT id FROM passkeys WHERE id = ? AND user_id = ?').get(credentialId, userId);
    if (!passkey) throw new Error('Passkey không tìm thấy');
    deletePasskey(credentialId, userId);
    return { removed: true };
}

export function renamePasskey(userId, credentialId, newName) {
    const passkey = db.prepare('SELECT id FROM passkeys WHERE id = ? AND user_id = ?').get(credentialId, userId);
    if (!passkey) throw new Error('Passkey không tìm thấy');
    db.prepare('UPDATE passkeys SET name = ? WHERE id = ?').run(newName, credentialId);
    return { renamed: true };
}

export function hasPasskeys(userId) {
    const count = db.prepare('SELECT COUNT(*) as count FROM passkeys WHERE user_id = ?').get(userId);
    return count.count > 0;
}

// ── Discoverable (usernameless) Passkey Login ──

export async function generateDiscoverableAuthOptions() {
    const options = await generateAuthenticationOptions({
        rpID: getRpId(),
        allowCredentials: [], // empty = discoverable / resident key
        userVerification: 'preferred',
    });

    // Store challenge with a special placeholder userId
    saveChallenge('__discoverable__', options.challenge, 'discoverable');

    return options;
}

export async function verifyDiscoverableAuth(response) {
    const expectedChallenge = getChallenge('__discoverable__', 'discoverable');
    if (!expectedChallenge) throw new Error('Phiên xác thực đã hết hạn. Vui lòng thử lại.');

    // Find the passkey + its owner by credential ID
    const passkeyRow = db.prepare('SELECT * FROM passkeys WHERE id = ?').get(response.id);
    if (!passkeyRow) throw new Error('Passkey không tìm thấy. Vui lòng đăng nhập bằng tài khoản/mật khẩu.');

    const matchingPasskey = {
        id: passkeyRow.id,
        publicKey: passkeyRow.public_key,
        counter: passkeyRow.counter,
        transports: passkeyRow.transports ? JSON.parse(passkeyRow.transports) : undefined,
    };

    let verification;
    try {
        verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge,
            expectedOrigin: getOrigins(),
            expectedRPID: getRpId(),
            credential: {
                id: matchingPasskey.id,
                publicKey: matchingPasskey.publicKey,
                counter: matchingPasskey.counter,
                transports: matchingPasskey.transports,
            },
        });
    } catch (error) {
        throw new Error('Xác thực passkey thất bại: ' + error.message);
    }

    deleteChallenge('__discoverable__', 'discoverable');

    if (!verification.verified) {
        throw new Error('Xác thực passkey thất bại');
    }

    updatePasskeyCounter(response.id, verification.authenticationInfo.newCounter);

    return { verified: true, userId: passkeyRow.user_id };
}
