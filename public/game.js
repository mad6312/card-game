/**
 * メインゲーム進行＆UI制御モジュール (public/game.js)
 * 通信、盤面描画、LPアニメーション、カットインキュー管理、ユーザー設定
 */

const socket = io();
window.socket = socket;

let myId = null;
let myPlayerNumber = null;
let latestGameState = null;
let currentCardSettings = {};

window.myId = myId;
window.latestGameState = latestGameState;

// LP変動アニメーション用状態管理
let currentRenderedScores = {};
let targetRenderedScores = {};
let activeScoreRollAnimators = {};
let activeScorePopups = {};
let lastKnownPlayerNames = {};
let showOtherPlayersInfo = true;
let isTimeBombModalTriggeredByEndTurn = false;
let skipBonusModal = true;
let ignoreDrawRestrictions = true; // デバッグドロー時の制限無視トグル

window.isTimeBombModalTriggeredByEndTurn = isTimeBombModalTriggeredByEndTurn;

// 攻撃カットインキュー＆LPアニメーション保留管理
let isAttackCutinPlaying = false;
let attackCutinQueue = [];
let pendingLPScoreQueue = [];

let availablePresetAvatars = [
    { id: 'avatar_1', name: '男性', image: '/images/avatars/avatar_1.png' },
    { id: 'avatar_2', name: '女性', image: '/images/avatars/avatar_2.png' },
    { id: 'avatar_3', name: '少年', image: '/images/avatars/avatar_3.png' },
    { id: 'avatar_4', name: '少女', image: '/images/avatars/avatar_4.png' },
    { id: 'avatar_5', name: 'ニワトリ', image: '/images/avatars/avatar_5.png' },
    { id: 'avatar_6', name: '牛', image: '/images/avatars/avatar_6.png' }
];

function isLaterPlayerInRound1(actorId, targetId) {
    if (!latestGameState || latestGameState.round !== 1) return false;
    if (!targetId || targetId === actorId) return false;
    if (targetId === latestGameState.currentTurnPlayerId) return false;
    const acted = latestGameState.actedPlayerIds || [];
    return !acted.includes(targetId);
}
window.isLaterPlayerInRound1 = isLaterPlayerInRound1;

const CARD_NAMES = {
    omamori_koban: 'お守り小判',
    omamori_koban_set: 'お守り小判セット',
    omamori_oban: 'お守り大判',
    wood_sword: '木の剣',
    wood_sword_set: '木の剣セット',
    shotgun: 'ショットガン',
    grenade: 'グレネード',
    diamond_sword: 'ダイヤの剣',
    earthquake: '地震',
    time_bomb: '時限爆弾',
    wood_shield: '木の盾',
    wood_shield_set: '木の盾セット',
    bronze_shield: '青銅の盾',
    bronze_shield_set: '青銅の盾セット',
    disaster: '大災害',
    invincible_armor: '無敵アーマー',
    dark_matter: 'ダークマター',
    steroid: 'ステロイド',
    smoke_screen: '煙幕'
};

function getFormattedCardDesc(card, currentUses) {
    if (!card || !card.desc) return '';
    let desc = card.desc;
    const uses = (typeof currentUses === 'number') ? currentUses : (card.usesLeft || 3);
    const setCardIds = ['wood_shield_set', 'bronze_shield_set', 'wood_sword_set', 'omamori_koban_set'];
    if (setCardIds.includes(card.id)) {
        if (/【残り回数】/.test(desc)) {
            desc = desc.replace(/【残り回数】[^\n]*/g, `【残り回数】${uses}回`);
        } else {
            desc = desc + `\n\n【残り回数】${uses}回`;
        }
    }
    return desc;
}
window.getFormattedCardDesc = getFormattedCardDesc;

socket.on('connect', () => {
    myId = socket.id;
    window.myId = myId;
});

socket.on('init', (data) => {
    myPlayerNumber = data.playerNumber;
    myId = data.id;
    window.myId = myId;
    document.getElementById('status').innerText = `あなたは P${myPlayerNumber} です。他のプレイヤーを待っています...`;
    const nameInput = document.getElementById('user-name-input');
    if (nameInput) nameInput.value = data.name || `P${myPlayerNumber}`;
    if (data.presetAvatars && data.presetAvatars.length > 0) {
        availablePresetAvatars = data.presetAvatars;
    }
    renderAvatarPicker();
});

socket.on('playerUpdate', (data) => {
    if (!latestGameState || !latestGameState.started) {
        document.getElementById('status').innerText = `現在の参加人数: ${data.playerCount} / 4 人`;
    }
});

socket.on('updateCardSettings', (settings) => {
    currentCardSettings = settings;
    renderCardSwitches();
});

socket.on('updatePublicInfoSetting', (enabled) => {
    showOtherPlayersInfo = enabled;
    const checkEl = document.getElementById('debug-public-info-check');
    const textEl = document.getElementById('debug-public-info-text');

    if (checkEl) checkEl.checked = enabled;
    if (textEl) {
        textEl.innerText = enabled ? '公開 (ON)' : '非公開 (OFF)';
        textEl.style.color = enabled ? '#2ecc71' : '#e74c3c';
    }

    if (latestGameState) {
        updatePlayersUI(latestGameState.players, latestGameState.currentTurnPlayerId);
    }
});

function togglePublicInfo(enabled) {
    socket.emit('togglePublicInfoSetting', enabled);
}

socket.on('updateBonusSkipSetting', (enabled) => {
    skipBonusModal = enabled;
    const checkEl = document.getElementById('debug-skip-bonus-check');
    const textEl = document.getElementById('debug-skip-bonus-text');
    if (checkEl) checkEl.checked = enabled;
    if (textEl) {
        textEl.innerText = enabled ? 'ON' : 'OFF';
        textEl.style.color = enabled ? '#2ecc71' : '#e74c3c';
    }
});

function toggleBonusSkip(enabled) {
    socket.emit('toggleBonusSkipSetting', enabled);
}

socket.on('updateDrawRestrictionsSetting', (enabled) => {
    ignoreDrawRestrictions = enabled;
    const checkEl = document.getElementById('debug-ignore-restrictions-check');
    const textEl = document.getElementById('debug-ignore-restrictions-text');
    if (checkEl) checkEl.checked = enabled;
    if (textEl) {
        textEl.innerText = enabled ? 'ON' : 'OFF';
        textEl.style.color = enabled ? '#2ecc71' : '#e74c3c';
    }
});

function toggleDrawRestrictions(enabled) {
    socket.emit('toggleDrawRestrictionsSetting', enabled);
}

socket.on('showCutIn', (data) => {
    window.closeDropActionModal();
    window.closeTimeBombModal();

    const overlay = document.getElementById('cutin-overlay');
    const img = document.getElementById('cutin-image');
    const title = document.getElementById('cutin-title');

    img.src = data.imagePath;
    title.textContent = data.title;

    overlay.classList.remove('hidden');
    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 2500);
});

// カットインキュー処理システム
function processAttackCutinQueue() {
    if (isAttackCutinPlaying || attackCutinQueue.length === 0) return;

    const nextCutinData = attackCutinQueue.shift();
    isAttackCutinPlaying = true;

    if (window.AttackAnimation && typeof window.AttackAnimation.play === 'function') {
        window.AttackAnimation.play(nextCutinData, () => {
            isAttackCutinPlaying = false;

            if (pendingLPScoreQueue.length > 0) {
                const mergedTasks = {};
                while (pendingLPScoreQueue.length > 0) {
                    const task = pendingLPScoreQueue.shift();
                    if (!mergedTasks[task.id]) {
                        mergedTasks[task.id] = { ...task };
                    } else {
                        mergedTasks[task.id].endVal = task.endVal;
                        mergedTasks[task.id].diff += task.diff;
                    }
                }
                Object.values(mergedTasks).forEach(t => {
                    triggerLPScoreAnimation(t.id, t.startVal, t.endVal, t.diff);
                });
            }

            if (attackCutinQueue.length > 0) {
                setTimeout(processAttackCutinQueue, 400);
            }
        });
    } else {
        isAttackCutinPlaying = false;
        if (attackCutinQueue.length > 0) {
            setTimeout(processAttackCutinQueue, 100);
        }
    }
}

socket.on('playAttackCutin', (data) => {
    window.closeDropActionModal();
    window.closeTimeBombModal();
    attackCutinQueue.push(data);
    processAttackCutinQueue();
});

socket.on('transferTimeBombResult', (data) => {
    window.closeTimeBombModal();
    if (window.isTimeBombModalTriggeredByEndTurn) {
        window.isTimeBombModalTriggeredByEndTurn = false;
        socket.emit('endTurn');
    }
});

function openUserSettingsModal() {
    if (latestGameState && myId && latestGameState.players[myId]) {
        const nameInput = document.getElementById('user-name-input');
        if (nameInput) nameInput.value = latestGameState.players[myId].name;
    }
    renderAvatarPicker();
    document.getElementById('user-settings-modal').style.display = 'block';
}

function closeUserSettingsModal() {
    document.getElementById('user-settings-modal').style.display = 'none';
}

function submitNameChange() {
    const nameInput = document.getElementById('user-name-input');
    if (!nameInput) return;
    const newName = nameInput.value.trim();
    if (!newName) {
        alert('名前を入力してください。');
        return;
    }
    socket.emit('changePlayerName', { newName });
    closeUserSettingsModal();
}

function renderAvatarPicker() {
    const container = document.getElementById('avatar-picker-list');
    if (!container) return;
    container.innerHTML = '';

    const currentAvatarId = (latestGameState && myId && latestGameState.players[myId])
        ? latestGameState.players[myId].avatar
        : 'avatar_default';

    availablePresetAvatars.forEach(av => {
        const img = document.createElement('img');
        img.src = av.image;
        img.alt = av.name;
        img.title = av.name;
        img.className = `avatar-picker-item ${av.id === currentAvatarId ? 'selected' : ''}`;
        img.onerror = () => { img.src = '/images/avatars/avatar_default.png'; };
        img.onclick = () => {
            socket.emit('changePlayerAvatar', { avatarId: av.id });
            closeUserSettingsModal();
        };
        container.appendChild(img);
    });
}

function renderCardSwitches() {
    const container = document.getElementById('card-switches');
    if (!container) return;
    container.innerHTML = '';

    Object.keys(CARD_NAMES).forEach(cardId => {
        const isEnabled = currentCardSettings[cardId] !== false;
        const div = document.createElement('div');
        div.className = 'switch-item';
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <img src="/images/${cardId}.png" class="mini-card-icon" alt="${CARD_NAMES[cardId]}">
                <span style="font-size: 0.9em;"><b>${CARD_NAMES[cardId]}</b></span>
            </div>
            <label style="cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 0.85em;">
                <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="toggleCard('${cardId}', this.checked)">
                <span style="color: ${isEnabled ? '#2ecc71' : '#e74c3c'}; font-weight: bold;">${isEnabled ? 'ON' : 'OFF'}</span>
            </label>
        `;
        container.appendChild(div);
    });
}

function toggleCard(cardId, enabled) {
    socket.emit('toggleCardSetting', { cardId, enabled });
}

function toggleAllCards(enabled) {
    Object.keys(CARD_NAMES).forEach(cardId => {
        socket.emit('toggleCardSetting', { cardId, enabled });
    });
}

function openSettingsModal() { document.getElementById('settings-modal').style.display = 'block'; }
function closeSettingsModal() { document.getElementById('settings-modal').style.display = 'none'; }

socket.on('errorMessage', (msg) => { alert(msg); });

socket.on('syncGameState', (data) => {
    latestGameState = data;
    window.latestGameState = latestGameState;

    if (typeof data.showOtherPlayersInfo !== 'undefined') {
        showOtherPlayersInfo = data.showOtherPlayersInfo;
    }
    if (typeof data.skipBonusModal !== 'undefined') {
        skipBonusModal = data.skipBonusModal;
        const checkEl = document.getElementById('debug-skip-bonus-check');
        const textEl = document.getElementById('debug-skip-bonus-text');
        if (checkEl) checkEl.checked = skipBonusModal;
        if (textEl) {
            textEl.innerText = skipBonusModal ? 'ON' : 'OFF';
            textEl.style.color = skipBonusModal ? '#2ecc71' : '#e74c3c';
        }
    }
    if (typeof data.ignoreDrawRestrictions !== 'undefined') {
        ignoreDrawRestrictions = data.ignoreDrawRestrictions;
        const checkEl = document.getElementById('debug-ignore-restrictions-check');
        const textEl = document.getElementById('debug-ignore-restrictions-text');
        if (checkEl) checkEl.checked = ignoreDrawRestrictions;
        if (textEl) {
            textEl.innerText = ignoreDrawRestrictions ? 'ON' : 'OFF';
            textEl.style.color = ignoreDrawRestrictions ? '#2ecc71' : '#e74c3c';
        }
    }

    document.getElementById('status').innerText = '';

    const draftArea = document.getElementById('draft-area');
    if (draftArea) {
        draftArea.style.display = 'none';
        draftArea.innerHTML = '';
    }

    document.getElementById('game-main').style.display = 'block';
    document.getElementById('round-info').innerText = `第 ${data.round} 巡目 / 全10巡`;

    const logBox = document.getElementById('log-box');

    if (data.players && logBox) {
        Object.values(data.players).forEach(p => {
            const old = lastKnownPlayerNames[p.id];
            if (old && old !== p.name && logBox.innerText) {
                logBox.innerText = logBox.innerText.split(old).join(p.name);
            }
            lastKnownPlayerNames[p.id] = p.name;
        });
    }

    if (data.log && logBox) {
        logBox.innerText = data.log + '\n' + logBox.innerText;
    }

    // スコア変動検知＆ロック
    const pendingScoreChanges = [];
    if (data.players) {
        Object.values(data.players).forEach(p => {
            const currentTargetScore = p.score;
            const prevTargetScore = (typeof targetRenderedScores[p.id] === 'number') ? targetRenderedScores[p.id] : currentTargetScore;

            if (prevTargetScore !== currentTargetScore) {
                const startVal = (typeof currentRenderedScores[p.id] === 'number') ? currentRenderedScores[p.id] : prevTargetScore;
                currentRenderedScores[p.id] = startVal;

                pendingScoreChanges.push({
                    id: p.id,
                    startVal: startVal,
                    endVal: currentTargetScore,
                    diff: currentTargetScore - prevTargetScore
                });
                targetRenderedScores[p.id] = currentTargetScore;
            } else {
                targetRenderedScores[p.id] = currentTargetScore;
                if (typeof currentRenderedScores[p.id] === 'undefined') {
                    currentRenderedScores[p.id] = currentTargetScore;
                }
            }
        });
    }

    updatePlayersUI(data.players, data.currentTurnPlayerId);
    updateTurnControls(data);
    renderDebugScorePanel(data.players);

    if (window.Scoreboard && pendingScoreChanges.length === 0) {
        window.Scoreboard.update(data.players, myId, availablePresetAvatars);
    }

    if (isAttackCutinPlaying || attackCutinQueue.length > 0) {
        pendingScoreChanges.forEach(change => {
            pendingLPScoreQueue.push(change);
        });
    } else {
        pendingScoreChanges.forEach(change => {
            triggerLPScoreAnimation(change.id, change.startVal, change.endVal, change.diff);
        });
    }
});

/* LP風得点変動アニメーション制御 */
function triggerLPScoreAnimation(playerId, startVal, endVal, diffVal) {
    if (activeScoreRollAnimators[playerId]) {
        cancelAnimationFrame(activeScoreRollAnimators[playerId]);
        delete activeScoreRollAnimators[playerId];
    }

    const existingPopup = document.getElementById(`score-popup-${playerId}`);
    if (existingPopup && existingPopup.parentNode) {
        existingPopup.remove();
    }

    const isPlus = diffVal > 0;
    activeScorePopups[playerId] = {
        text: `${isPlus ? '+' : ''}${diffVal.toLocaleString()}`,
        isPlus: isPlus,
        expiresAt: Date.now() + 1150
    };

    attachScorePopup(playerId);

    const duration = 750;
    const startTime = performance.now();

    function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const currentVal = Math.round(startVal + (endVal - startVal) * easeProgress);

        currentRenderedScores[playerId] = currentVal;

        const scoreValEl = document.getElementById(`score-val-${playerId}`);
        if (scoreValEl) {
            scoreValEl.innerText = `${currentVal.toLocaleString()}点`;
        }

        if (progress < 1) {
            activeScoreRollAnimators[playerId] = requestAnimationFrame(step);
        } else {
            currentRenderedScores[playerId] = endVal;
            delete activeScoreRollAnimators[playerId];

            if (scoreValEl) {
                scoreValEl.innerText = `${endVal.toLocaleString()}点`;
                scoreValEl.classList.remove('pulse');
                void scoreValEl.offsetWidth;
                scoreValEl.classList.add('pulse');
            }

            if (window.Scoreboard && latestGameState && latestGameState.players) {
                window.Scoreboard.update(latestGameState.players, myId, availablePresetAvatars);
            }

            setTimeout(() => {
                delete activeScorePopups[playerId];
                const popup = document.getElementById(`score-popup-${playerId}`);
                if (popup && popup.parentNode) popup.remove();
            }, 350);
        }
    }

    activeScoreRollAnimators[playerId] = requestAnimationFrame(step);
}

function attachScorePopup(playerId) {
    const popupInfo = activeScorePopups[playerId];
    if (!popupInfo || Date.now() > popupInfo.expiresAt) return;

    const scoreContainer = document.getElementById(`score-container-${playerId}`);
    if (!scoreContainer) return;

    let popup = document.getElementById(`score-popup-${playerId}`);
    if (!popup) {
        popup = document.createElement('span');
        popup.id = `score-popup-${playerId}`;
        popup.className = `score-diff-popup ${popupInfo.isPlus ? 'plus' : 'minus'}`;
        popup.innerText = popupInfo.text;
        scoreContainer.appendChild(popup);
    }
}

function renderDebugScorePanel(players) {
    const container = document.getElementById('debug-score-list');
    if (!container || !players) return;

    const playerList = Object.values(players).sort((a, b) => a.number - b.number);
    if (playerList.length === 0) {
        container.innerHTML = '<div style="color: #94a3b8; font-size: 11px;">プレイヤー接続待機中...</div>';
        return;
    }

    container.innerHTML = '';
    playerList.forEach(p => {
        const row = document.createElement('div');
        row.className = 'debug-p-row';
        row.innerHTML = `
            <span style="font-weight:bold; min-width:40px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${p.name}">P${p.number}:</span>
            <input type="number" class="debug-score-input" id="debug-input-${p.id}" value="${p.score}" step="500">
            <button style="background:#27ae60; padding:2px 6px; font-size:10px; border:none; border-radius:3px; color:white; cursor:pointer;" onclick="setDebugScoreDirect('${p.id}')">Set</button>
            <div class="debug-btn-group">
                <button onclick="changeDebugScore('${p.id}', 1000)">+1k</button>
                <button onclick="changeDebugScore('${p.id}', -1000)">-1k</button>
                <button onclick="changeDebugScore('${p.id}', 5000)">+5k</button>
                <button onclick="changeDebugScore('${p.id}', -5000)">-5k</button>
                <button style="background:#8e44ad;" onclick="debugDrawCard('${p.id}')">ドロー</button>
            </div>
        `;
        container.appendChild(row);
    });
}

function changeDebugScore(targetPlayerId, amount) {
    socket.emit('debugUpdateScore', { targetPlayerId, amount, setDirect: false });
}

function debugDrawCard(targetPlayerId) {
    socket.emit('debugDrawCard', { targetPlayerId });
}

function setDebugScoreDirect(targetPlayerId) {
    const input = document.getElementById(`debug-input-${targetPlayerId}`);
    if (input && input.value !== '') {
        socket.emit('debugUpdateScore', { targetPlayerId, amount: Number(input.value), setDirect: true });
    }
}

function updatePlayersUI(players, currentTurnPlayerId) {
    const sorted = Object.values(players).sort((a, b) => b.score - a.score);
    const playerList = Object.values(players).sort((a, b) => a.number - b.number);

    let myIndex = playerList.findIndex(p => p.id === myId);
    if (myIndex === -1) myIndex = 0;

    const totalPlayers = playerList.length;

    const seats = {
        bottom: document.getElementById('seat-bottom'),
        right: document.getElementById('seat-right'),
        top: document.getElementById('seat-top'),
        left: document.getElementById('seat-left')
    };

    Object.values(seats).forEach(s => { if (s) s.innerHTML = ''; });

    const seatKeys = ['bottom', 'right', 'top', 'left'];

    playerList.forEach((p, idx) => {
        const relativePos = (idx - myIndex + totalPlayers) % totalPlayers;
        const targetSeatKey = seatKeys[relativePos];
        const targetContainer = seats[targetSeatKey];

        if (!targetContainer) return;

        const isMe = (p.id === myId);
        const isTurn = (p.id === currentTurnPlayerId);
        const rank = Object.values(players).filter(sp => sp.score > p.score).length + 1;
        const box = document.createElement('div');
        box.className = `player-box ${isTurn ? 'active' : ''}`;

        const hasActed = latestGameState && latestGameState.actedPlayerIds && latestGameState.actedPlayerIds.includes(p.id);
        const actedBadgeHtml = hasActed ? `<div class="acted-badge">済</div>` : '';

        let avatarImgSrc = '/images/avatars/avatar_default.png';
        if (p.avatar && p.avatar !== 'avatar_default') {
            const matched = availablePresetAvatars.find(a => a.id === p.avatar);
            if (matched) avatarImgSrc = matched.image;
        }

        let defInfo = '<span style="color:#7f8c8d;">なし</span>';
        if (p.defenseCard) {
            const card = p.defenseCard.card;
            const clickAttr = isMe ? `onclick="window.openDropCardModal('DEFENSE', null)"` : '';
            const defDescText = getFormattedCardDesc(card, p.defenseCard.usesLeft);

            defInfo = `
                <span style="color:#2ecc71;">
                    <div class="def-card-wrapper">
                        ${card.image ? `<img src="${card.image}" class="mini-card-icon ${isMe ? 'draggable-def-card' : ''}" ${clickAttr}>` : ''}
                        <div class="card-tooltip">
                            <div style="font-weight: bold; color: #f1c40f; margin-bottom: 3px;">${card.name}</div>
                            <div>${defDescText}</div>
                        </div>
                    </div>
                    ${card.name} (${p.defenseCard.usesLeft}回)
                </span>
            `;
        }

        let infoRowHtml = '';
        if (isMe || showOtherPlayersInfo) {
            infoRowHtml = `<div style="margin-top:3px;">手札: <b>${p.hand ? p.hand.length : 0}</b> 枚 | 防御: ${defInfo}</div>`;
        } else {
            const hasRevealedActiveDefense = p.defenseCard && p.defenseCard.revealed && p.defenseCard.usesLeft > 0;
            if (hasRevealedActiveDefense) {
                infoRowHtml = `<div style="margin-top:3px;">防御: ${defInfo}</div>`;
            }
        }

        let handHtml = '';
        if (isMe) {
            handHtml += `<div style="margin-top:6px;"><b>手札 (クリックして使用)</b>`;
            if (p.hand && p.hand.length > 0) {
                handHtml += `<div class="my-hand-container">`;
                p.hand.forEach(card => {
                    const descText = getFormattedCardDesc(card, card.usesLeft);
                    handHtml += `
                        <div class="hand-card-wrapper" onclick="window.openDropCardModal('HAND', '${card.instanceId}')">
                            <img src="${card.image}" class="card-img" alt="${card.name}">
                            <div class="card-tooltip">
                                <div style="font-weight: bold; color: #f1c40f; margin-bottom: 3px;">${card.name}</div>
                                <div>${descText}</div>
                            </div>
                        </div>
                    `;
                });
                handHtml += `</div>`;
            } else {
                handHtml += ` <span style="color:#7f8c8d;">(なし)</span>`;
            }
            handHtml += `</div>`;
        }

        let statusBadgesHtml = '';

        if (p.immunityCount > 0) {
            statusBadgesHtml += `<span style="color:#e74c3c; font-weight:bold; font-size:11px; background:#1e293b; padding:1px 5px; border-radius:4px; border:1px solid #e74c3c; flex-shrink:0;">[選択不可:${p.immunityCount}]</span>`;
        }

        if (p.invincibleTurns > 0) {
            if (p.invincibleSource === 'DARK_MATTER') {
                statusBadgesHtml += `
                    <div class="status-badge-wrapper">
                        <img src="/images/dark_matter.png" class="status-badge-img" alt="ダークマター">
                        <div class="card-tooltip">
                            <div style="font-weight: bold; color: #f1c40f; margin-bottom: 3px;">ダークマター</div>
                            <div>無敵：あらゆる攻撃カードの効果を受けない。</div>
                        </div>
                    </div>
                `;
            } else if (isMe || p.armorRevealed) {
                statusBadgesHtml += `
                    <div class="status-badge-wrapper">
                        <img src="/images/invincible_armor.png" class="status-badge-img" alt="無敵アーマー">
                        <span class="status-badge-count">${p.invincibleTurns}</span>
                        <div class="card-tooltip">
                            <div style="font-weight: bold; color: #f1c40f; margin-bottom: 3px;">無敵アーマー</div>
                            <div>無敵：あらゆる攻撃カードの効果を受けない。</div>
                        </div>
                    </div>
                `;
            }
        }

        if (p.steroidTurns > 0 && (isMe || p.steroidRevealed)) {
            statusBadgesHtml += `
                <div class="status-badge-wrapper">
                    <img src="/images/steroid.png" class="status-badge-img" alt="ステロイド">
                    <span class="status-badge-count">${p.steroidTurns}</span>
                    <div class="card-tooltip">
                        <div style="font-weight: bold; color: #f1c40f; margin-bottom: 3px;">ステロイド</div>
                        <div>ステロイド：一部を除く攻撃カードの効果を受けない。</div>
                    </div>
                </div>
            `;
        }

        if (p.darknessTurns > 0) {
            statusBadgesHtml += `
                <div class="status-badge-wrapper">
                    <img src="/images/smoke_screen.png" class="status-badge-img" alt="煙幕">
                    <span class="status-badge-count">${p.darknessTurns}</span>
                    <div class="card-tooltip">
                        <div style="font-weight: bold; color: #f1c40f; margin-bottom: 3px;">煙幕</div>
                        <div>暗闇：攻撃カードの命中率が半減される。</div>
                    </div>
                </div>
            `;
        }

        if (p.timeBombTurns > 0) {
            const clickAttr = (isMe && isTurn) ? `onclick="window.openTimeBombModal(false)" style="cursor: pointer;"` : '';
            statusBadgesHtml += `
                <div class="status-badge-wrapper" ${clickAttr}>
                    <img src="/images/time_bomb.png" class="status-badge-img" alt="時限爆弾">
                    <span class="status-badge-count">${p.timeBombTurns}</span>
                    <div class="card-tooltip">
                        <div style="font-weight: bold; color: #e74c3c; margin-bottom: 3px;">時限爆弾</div>
                        <div>時限爆弾：カウントが0になると、爆発して6,000点ダメージを受け、さらに手札・防御カードをすべて失う。<br>自分との得点差が3,000点以内の相手に受け渡すことができる(成功率50%)。</div>
                    </div>
                </div>
            `;
        }

        let badgeRowContainerHtml = '';
        if (statusBadgesHtml) {
            badgeRowContainerHtml = `<div class="status-badges-row">${statusBadgesHtml}</div>`;
        }

        const scoreDisplayVal = (typeof currentRenderedScores[p.id] === 'number') ? currentRenderedScores[p.id] : p.score;

        box.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:3px;">
                <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0; margin-right:6px;">
                    <img src="${avatarImgSrc}" class="player-avatar-img" alt="avatar" onerror="this.src='/images/avatars/avatar_default.png'">
                    <span style="font-weight:bold; font-size:0.95em; word-break:break-all; overflow-wrap:break-word; line-height:1.25;" title="${p.name}">
                        ${p.name}${isMe ? ' <span style="font-size:0.85em; color:#94a3b8;">(あなた)</span>' : ''}
                    </span>
                </div>
                <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                    ${isTurn ? '<span style="color:#f1c40f; font-weight:bold;">★</span>' : ''}
                    <span style="color:#f1c40f; font-weight:bold; font-size:0.95em;">${rank}位</span>
                </div>
            </div>
            ${badgeRowContainerHtml}
            <div class="player-score-container" id="score-container-${p.id}">
                <span>持ち点: </span>
                <span class="player-score-value" id="score-val-${p.id}" style="margin-left:4px;">${scoreDisplayVal.toLocaleString()}点</span>
            </div>
            ${infoRowHtml}
            ${handHtml}
            ${actedBadgeHtml}
        `;

        targetContainer.appendChild(box);
        attachScorePopup(p.id);
    });
}

document.addEventListener('mouseover', (e) => {
    const wrapper = e.target.closest('.def-card-wrapper, .status-badge-wrapper, .hand-card-wrapper');
    const tooltipEl = document.getElementById('global-tooltip');
    if (!tooltipEl) return;

    if (wrapper) {
        const tooltipTemplate = wrapper.querySelector('.card-tooltip');
        if (tooltipTemplate) {
            tooltipEl.innerHTML = tooltipTemplate.innerHTML;
            tooltipEl.style.display = 'block';

            const targetRect = wrapper.getBoundingClientRect();
            const tooltipWidth = tooltipEl.offsetWidth || 250;
            const tooltipHeight = tooltipEl.offsetHeight || 100;

            const padding = 10;
            let left = targetRect.left + (targetRect.width - tooltipWidth) / 2;
            let top = targetRect.top - tooltipHeight - 8;

            if (top < padding) top = targetRect.bottom + 8;
            if (top + tooltipHeight > window.innerHeight - padding) top = window.innerHeight - tooltipHeight - padding;
            if (left < padding) left = padding;
            else if (left + tooltipWidth > window.innerWidth - padding) left = window.innerWidth - tooltipWidth - padding;

            tooltipEl.style.left = `${left}px`;
            tooltipEl.style.top = `${top}px`;
        }
    }
});

document.addEventListener('mouseout', (e) => {
    const wrapper = e.target.closest('.def-card-wrapper, .status-badge-wrapper, .hand-card-wrapper');
    if (wrapper) {
        const tooltipEl = document.getElementById('global-tooltip');
        if (tooltipEl) tooltipEl.style.display = 'none';
    }
});

function handleEndTurnClick() {
    if (!latestGameState) return;
    const myPlayer = latestGameState.players[myId];
    if (!myPlayer) return;

    if (myPlayer.timeBombTurns > 0 && !myPlayer.bombTransferAttempted) {
        const validTargets = Object.values(latestGameState.players).filter(p => {
            if (p.id === myId) return false;
            const diff = Math.abs(myPlayer.score - p.score);
            const isProtected = (p.invincibleTurns > 0) || (p.steroidTurns > 0);
            return diff <= 3000 && !isProtected;
        });

        if (validTargets.length > 0) {
            window.openTimeBombModal(true);
            return;
        }
    }

    socket.emit('endTurn');
}

function updateTurnControls(data) {
    const roundInfo = document.getElementById('round-info');
    const endTurnBtnContainer = document.getElementById('center-end-turn-btn');
    const centerStatus = document.getElementById('center-status');
    const bonusModal = document.getElementById('bonus-choice-modal');
    const discardModal = document.getElementById('discard-modal');

    const isMyTurn = (data.currentTurnPlayerId === myId);
    const myPlayer = data.players[myId];

    roundInfo.innerHTML = `第 ${data.round} 巡目 / 全10巡`;
    endTurnBtnContainer.innerHTML = '';
    if (centerStatus) centerStatus.innerText = '';
    if (bonusModal) bonusModal.style.display = 'none';
    if (discardModal) discardModal.style.display = 'none';

    if (!isMyTurn) return;

    if (data.turnPhase === 'BONUS_CHOICE') {
        if (skipBonusModal) {
            const hasActiveAnim = Object.keys(activeScoreRollAnimators).length > 0 || isAttackCutinPlaying || attackCutinQueue.length > 0;
            if (hasActiveAnim) {
                setTimeout(() => window.chooseBonusChoice(0), 650);
            } else {
                window.chooseBonusChoice(0);
            }
            return;
        }
        if (bonusModal) {
            const selectEl = document.getElementById('turn-bonus-score-select');
            if (selectEl) selectEl.value = "3000";
            bonusModal.style.display = 'block';
        }
        roundInfo.innerHTML += ` <span style="color:#f1c40f;">【ボーナス選択中】</span>`;
    } else if (data.turnPhase === 'MAIN') {
        roundInfo.innerHTML += `<br><span style="color:#f1c40f; font-size: 0.85em;">★ あなたのターンです</span>`;
        if (centerStatus) centerStatus.innerText = '手札のカードをクリックして使用';

        endTurnBtnContainer.innerHTML = `
            <button class="btn" style="background:#2980b9; height:100%; white-space:nowrap; margin:0; padding:0 12px; font-weight:bold;" onclick="handleEndTurnClick()">
                ターン終了
            </button>
        `;
    } else if (data.turnPhase === 'DISCARD') {
        roundInfo.innerHTML += ` <span style="color:#e74c3c;">【手札オーバー】</span>`;
        const discardContainer = document.getElementById('discard-cards-container');
        if (discardContainer && myPlayer && myPlayer.hand) {
            discardContainer.innerHTML = '';
            myPlayer.hand.forEach(card => {
                const itemDiv = document.createElement('div');
                itemDiv.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:8px; background:#1a252f; padding:10px; border-radius:8px; border:1px solid #475569;';
                itemDiv.innerHTML = `
                    <img src="${card.image}" style="width:90px; height:130px; object-fit:contain; border-radius:4px; background:#000;" alt="カード">
                    <button class="btn" style="background:#e74c3c; width:100%; margin:0; padding:6px 0; font-weight:bold;" onclick="socket.emit('discardCard', '${card.instanceId}')">捨てる</button>
                `;
                discardContainer.appendChild(itemDiv);
            });
            if (discardModal) discardModal.style.display = 'block';
        }
    }
}