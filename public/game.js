const socket = io();
let myId = null;
let myPlayerNumber = null;
let latestGameState = null;
let currentCardSettings = {};

// LP変動アニメーション用状態管理
let currentRenderedScores = {};
let targetRenderedScores = {};
let activeScoreRollAnimators = {};
let activeScorePopups = {};
let lastKnownPlayerNames = {};
let showOtherPlayersInfo = true;
let isTimeBombModalTriggeredByEndTurn = false;
let skipBonusModal = true;

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

socket.on('connect', () => { myId = socket.id; });

socket.on('init', (data) => {
    myPlayerNumber = data.playerNumber;
    myId = data.id;
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

socket.on('showCutIn', (data) => {
    closeDropActionModal();
    closeTimeBombModal();

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

// カットインキュー処理システム（多段カットイン・連続演出の順次再生）
function processAttackCutinQueue() {
    if (isAttackCutinPlaying || attackCutinQueue.length === 0) return;

    const nextCutinData = attackCutinQueue.shift();
    isAttackCutinPlaying = true;

    if (window.AttackAnimation && typeof window.AttackAnimation.play === 'function') {
        window.AttackAnimation.play(nextCutinData, () => {
            isAttackCutinPlaying = false;

            // 先行カットイン分のLP変動を消化
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

            // 次のカットイン（ダークマター等）があれば順次再生
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

// 攻撃カットイン演出の受信リスナー
socket.on('playAttackCutin', (data) => {
    closeDropActionModal();
    closeTimeBombModal();
    attackCutinQueue.push(data);
    processAttackCutinQueue();
});

socket.on('transferTimeBombResult', (data) => {
    closeTimeBombModal();
    if (isTimeBombModalTriggeredByEndTurn) {
        isTimeBombModalTriggeredByEndTurn = false;
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

socket.on('draftStart', (data) => {
    renderDraftUI(data.availableScores, '最初の得点を選択してください：');
});

socket.on('draftConflict', (data) => {
    const draftArea = document.getElementById('draft-area');
    updatePlayersUI(data.players, null);
    renderDebugScorePanel(data.players);

    if (data.unresolvedIds.includes(myId)) {
        document.getElementById('status').innerText = '選択が被りました！再選択してください。';
        if (draftArea) renderDraftUI(data.availableScores, '残りの選択肢から選んでください：');
    } else {
        document.getElementById('status').innerText = 'あなたの得点は確定しました。他のプレイヤーの再選択を待っています...';
        if (draftArea) {
            draftArea.style.display = 'block';
            draftArea.innerHTML = '';
        }
    }
});

function renderDraftUI(scores, titleText) {
    const draftArea = document.getElementById('draft-area');
    if (!draftArea) return;
    draftArea.style.display = 'block';
    draftArea.innerHTML = `<h3>${titleText}</h3><div id="draft-btns"></div>`;
    const btnContainer = document.getElementById('draft-btns');

    scores.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.innerText = (s > 0 ? '+' : '') + s.toLocaleString() + '点';
        btn.onclick = () => {
            socket.emit('selectDraftScore', s);
            btnContainer.querySelectorAll('button').forEach(b => b.disabled = true);
            document.getElementById('status').innerText = '選択を送信しました。他のプレイヤーを待っています...';
        };
        btnContainer.appendChild(btn);
    });
}

socket.on('errorMessage', (msg) => { alert(msg); });

socket.on('syncGameState', (data) => {
    latestGameState = data;
    if (typeof data.showOtherPlayersInfo !== 'undefined') {
        showOtherPlayersInfo = data.showOtherPlayersInfo;
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

    // 1. 各プレイヤーのスコア変動を厳密検知＆開始値のロック
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

    // 2. 盤面DOMの再構築
    updatePlayersUI(data.players, data.currentTurnPlayerId);
    updateTurnControls(data);
    renderDebugScorePanel(data.players);

    // 3. スコアボード初期同期
    if (window.Scoreboard && pendingScoreChanges.length === 0) {
        window.Scoreboard.update(data.players, myId, availablePresetAvatars);
    }

    // 4. スコア変動演出のシーケンス制御
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
            const clickAttr = isMe ? `onclick="openDropCardModal('DEFENSE', null)"` : '';
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
                        <div class="hand-card-wrapper" onclick="openDropCardModal('HAND', '${card.instanceId}')">
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
            const clickAttr = (isMe && isTurn) ? `onclick="openTimeBombModal(false)" style="cursor: pointer;"` : '';
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

/**
 * ターン開始ボーナス得点の決定処理（数値選択式 / スキップON時は0点処理）
 */
function chooseBonusChoice(directAmount) {
    let scoreAmount = 3000;
    if (typeof directAmount === 'number') {
        scoreAmount = directAmount;
    } else {
        const selectEl = document.getElementById('turn-bonus-score-select');
        if (selectEl) {
            scoreAmount = Number(selectEl.value) || 0;
        }
    }

    socket.emit('chooseBonus', { scoreAmount });
    const modal = document.getElementById('bonus-choice-modal');
    if (modal) modal.style.display = 'none';
}

function toggleBonusSkip(enabled) {
    socket.emit('toggleBonusSkipSetting', enabled);
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
            openTimeBombModal(true);
            return;
        }
    }

    socket.emit('endTurn');
}

function openTimeBombModal(isWarningFromEndTurn = false) {
    if (!latestGameState || !myId) return;
    const myPlayer = latestGameState.players[myId];
    if (!myPlayer || myPlayer.timeBombTurns <= 0) return;

    isTimeBombModalTriggeredByEndTurn = isWarningFromEndTurn;

    const modal = document.getElementById('time-bomb-modal');
    const controls = document.getElementById('time-bomb-modal-controls');
    controls.innerHTML = '';

    const validTargets = Object.values(latestGameState.players).filter(p => {
        if (p.id === myId) return false;
        const diff = Math.abs(myPlayer.score - p.score);
        const isProtected = (p.invincibleTurns > 0) || (p.steroidTurns > 0);
        return diff <= 3000 && !isProtected;
    });

    if (myPlayer.bombTransferAttempted) {
        controls.innerHTML = `
            <div style="color:#e74c3c; font-weight:bold; margin-bottom:12px;">受け渡しに失敗しました（このターンは再試行できません）</div>
            <button class="btn" style="background:#7f8c8d; width:100%;" onclick="closeTimeBombModal()">閉じる</button>
        `;
    } else if (validTargets.length === 0) {
        controls.innerHTML = `
            <div style="color:#e74c3c; font-weight:bold; margin-bottom:12px;">受け渡し可能な相手が存在しません（±3,000点以内・無敵除く）</div>
            ${isWarningFromEndTurn ? `<button class="btn" style="background:#2980b9; width:100%; margin-bottom:6px;" onclick="closeTimeBombModal(); socket.emit('endTurn');">無視してターン終了</button>` : ''}
            <button class="btn" style="background:#7f8c8d; width:100%;" onclick="closeTimeBombModal()">閉じる</button>
        `;
    } else {
        let optionsHtml = '';
        validTargets.forEach(t => {
            const diff = t.score - myPlayer.score;
            const signStr = diff > 0 ? `+${diff.toLocaleString()}` : (diff < 0 ? `${diff.toLocaleString()}` : '±0');
            optionsHtml += `<option value="${t.id}">${t.name} (点差: ${signStr}点)</option>`;
        });

        const submitBtnText = isWarningFromEndTurn ? '50%の確率で受け渡してターン終了' : '50%の確率で受け渡す';

        controls.innerHTML = `
            <div style="margin-bottom:12px; text-align:left; background:#1a252f; padding:10px; border-radius:6px;">
                <label style="display:block; margin-bottom:4px; font-weight:bold;">受け渡し先プレイヤー:</label>
                <select id="time-bomb-target-select" style="width:100%; padding:6px; background:#334155; color:#fff; border:1px solid #475569; border-radius:4px;">
                    ${optionsHtml}
                </select>
            </div>
            <button class="btn" style="background:#e74c3c; width:100%; font-weight:bold; margin-bottom:6px;" onclick="executeTransferTimeBomb()">${submitBtnText}</button>
            ${isWarningFromEndTurn ? `<button class="btn" style="background:#2980b9; width:100%; margin-bottom:6px;" onclick="closeTimeBombModal(); socket.emit('endTurn');">無視してターン終了</button>` : ''}
            <button class="btn" style="background:#7f8c8d; width:100%;" onclick="closeTimeBombModal()">閉じる</button>
        `;
    }

    modal.style.display = 'flex';
}

function closeTimeBombModal() {
    document.getElementById('time-bomb-modal').style.display = 'none';
}

function executeTransferTimeBomb() {
    const selectEl = document.getElementById('time-bomb-target-select');
    if (!selectEl) return;
    const targetPlayerId = selectEl.value;
    socket.emit('transferTimeBomb', { targetPlayerId });
}

function executeUseKobanSet(instanceId) {
    const selectEl = document.getElementById(`drop-koban-count-${instanceId}`);
    const attackCount = selectEl ? Number(selectEl.value) : 1;
    socket.emit('playCard', { instanceId: instanceId, attackCount: attackCount });
    closeDropActionModal();
}

function executeUseOban(instanceId) {
    const selectEl = document.getElementById(`drop-oban-score-${instanceId}`);
    const chosenScore = selectEl ? Number(selectEl.value) : 8000;
    socket.emit('playCard', { instanceId: instanceId, chosenScore: chosenScore });
    closeDropActionModal();
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
                setTimeout(() => chooseBonusChoice(0), 650);
            } else {
                chooseBonusChoice(0);
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

function closeDropActionModal() {
    document.getElementById('drop-action-modal').style.display = 'none';
}

function calculateLowerTargetsHitRates(lowerPlayers, isDarkness = false) {
    if (!lowerPlayers || lowerPlayers.length === 0) return [];

    const sorted = [...lowerPlayers].sort((a, b) => b.score - a.score);
    const groups = [];
    sorted.forEach(p => {
        let lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.score === p.score) {
            lastGroup.players.push(p);
        } else {
            groups.push({ score: p.score, players: [p] });
        }
    });

    const result = [];
    let pMiss = 1.0;
    const darknessMult = isDarkness ? 0.5 : 1.0;

    groups.forEach(group => {
        const m = group.players.length;
        const baseProb = 0.5 * darknessMult;
        const groupHitProb = pMiss * (1 - Math.pow(1 - baseProb, m));
        const individualHitProb = groupHitProb / m;

        group.players.forEach(p => {
            const ratePercent = Math.round(individualHitProb * 1000) / 10;
            result.push({ player: p, hitRate: ratePercent });
        });

        pMiss = pMiss * Math.pow(1 - baseProb, m);
    });

    return result;
}

function calculateWoodShieldGroupHitRates(candidates, myScore, attackCount = 1, isDarkness = false) {
    if (!candidates || candidates.length === 0) return { groupStr: '', rateDetailStr: '' };

    const hitProbabilities = {};
    candidates.forEach(p => hitProbabilities[p.id] = 0);

    let currentStates = [{ aliveIds: candidates.map(p => p.id), prob: 1.0 }];
    const darknessMult = isDarkness ? 0.5 : 1.0;

    for (let step = 0; step < attackCount; step++) {
        const nextStates = [];
        currentStates.forEach(state => {
            const aliveCandidates = candidates.filter(p => state.aliveIds.includes(p.id));
            if (aliveCandidates.length === 0) {
                nextStates.push(state);
                return;
            }

            const groups = [];
            const sorted = [...aliveCandidates].sort((a, b) => Math.abs(myScore - a.score) - Math.abs(myScore - b.score));
            sorted.forEach(p => {
                const diff = Math.abs(myScore - p.score);
                let last = groups[groups.length - 1];
                if (last && last.diff === diff) last.players.push(p);
                else groups.push({ diff, players: [p] });
            });

            const singleHitProb = {};
            let pMissCumulative = 1.0;

            groups.forEach(g => {
                const m = g.players.length;
                let r = Math.max(0, 1 - g.diff / 10000) * darknessMult;
                if (r <= 0 || m === 0) return;

                const pGroupAllMiss = Math.pow(1 - r, m);
                const pGroupHitTotal = pMissCumulative * (1 - pGroupAllMiss);
                const pIndividual = pGroupHitTotal / m;

                g.players.forEach(p => singleHitProb[p.id] = pIndividual);
                pMissCumulative *= pGroupAllMiss;
            });

            const totalHitProbInThisStep = Object.values(singleHitProb).reduce((a, b) => a + b, 0);
            const missProbInThisStep = 1 - totalHitProbInThisStep;

            if (missProbInThisStep > 0) {
                nextStates.push({ aliveIds: [...state.aliveIds], prob: state.prob * missProbInThisStep });
            }

            Object.keys(singleHitProb).forEach(hitPlayerId => {
                const pHit = singleHitProb[hitPlayerId];
                if (pHit <= 0) return;

                const transitionProb = state.prob * pHit;
                hitProbabilities[hitPlayerId] += transitionProb;

                nextStates.push({
                    aliveIds: state.aliveIds.filter(id => id !== hitPlayerId),
                    prob: transitionProb
                });
            });
        });

        currentStates = nextStates;
    }

    const rateDetails = [];
    const playerNames = [];

    candidates.forEach(p => {
        const finalProb = hitProbabilities[p.id] || 0;
        const ratePercent = Math.round(finalProb * 1000) / 10;
        rateDetails.push(`${p.name}: ${ratePercent}%`);
        playerNames.push(p.name);
    });

    return { groupStr: playerNames.join(','), rateDetailStr: rateDetails.join(', ') };
}

function calculateBronzeShieldGroupHitRates(candidates, myScore, isDarkness = false) {
    if (!candidates || candidates.length === 0) return { groupStr: '', rateDetailStr: '' };

    const sorted = [...candidates].sort((a, b) => (myScore - a.score) - (myScore - b.score));
    const darknessMult = isDarkness ? 0.5 : 1.0;

    const groups = [];
    sorted.forEach(p => {
        const diff = myScore - p.score;
        let last = groups[groups.length - 1];
        if (last && last.diff === diff) last.players.push(p);
        else groups.push({ diff, players: [p] });
    });

    const result = [];
    let pMissCumulative = 1.0;

    groups.forEach(g => {
        const m = g.players.length;
        let r = Math.max(0, 1 - g.diff / 5000) * darknessMult;
        if (r <= 0 || m === 0) return;

        const pGroupAllMiss = Math.pow(1 - r, m);
        const pGroupHitTotal = pMissCumulative * (1 - pGroupAllMiss);
        const pIndividual = pGroupHitTotal / m;

        g.players.forEach(p => {
            const ratePercent = Math.round(pIndividual * 1000) / 10;
            result.push(`${p.name}: ${ratePercent}%`);
        });

        pMissCumulative *= pGroupAllMiss;
    });

    return { groupStr: sorted.map(p => p.name).join(','), rateDetailStr: result.join(', ') };
}

function calculateBronzeShieldSetGroupHitRates(candidates, myScore, attackCount = 1, isDarkness = false) {
    if (!candidates || candidates.length === 0) return { groupStr: '', rateDetailStr: '' };

    const hitProbabilities = {};
    candidates.forEach(p => hitProbabilities[p.id] = 0);

    let currentStates = [{ aliveIds: candidates.map(p => p.id), prob: 1.0 }];
    const darknessMult = isDarkness ? 0.5 : 1.0;

    for (let step = 0; step < attackCount; step++) {
        const nextStates = [];
        currentStates.forEach(state => {
            const aliveCandidates = candidates.filter(p => state.aliveIds.includes(p.id));
            if (aliveCandidates.length === 0) {
                nextStates.push(state);
                return;
            }

            const groups = [];
            const sorted = [...aliveCandidates].sort((a, b) => (myScore - a.score) - (myScore - b.score));
            sorted.forEach(p => {
                const diff = myScore - p.score;
                let last = groups[groups.length - 1];
                if (last && last.diff === diff) last.players.push(p);
                else groups.push({ diff, players: [p] });
            });

            const singleHitProb = {};
            let pMissCumulative = 1.0;

            groups.forEach(g => {
                const m = g.players.length;
                let r = Math.max(0, 1 - g.diff / 5000) * darknessMult;
                if (r <= 0 || m === 0) return;

                const pGroupAllMiss = Math.pow(1 - r, m);
                const pGroupHitTotal = pMissCumulative * (1 - pGroupAllMiss);
                const pIndividual = pGroupHitTotal / m;

                g.players.forEach(p => singleHitProb[p.id] = pIndividual);
                pMissCumulative *= pGroupAllMiss;
            });

            const totalHitProbInThisStep = Object.values(singleHitProb).reduce((a, b) => a + b, 0);
            const missProbInThisStep = 1 - totalHitProbInThisStep;

            if (missProbInThisStep > 0) {
                nextStates.push({ aliveIds: [...state.aliveIds], prob: state.prob * missProbInThisStep });
            }

            Object.keys(singleHitProb).forEach(hitPlayerId => {
                const pHit = singleHitProb[hitPlayerId];
                if (pHit <= 0) return;

                const transitionProb = state.prob * pHit;
                hitProbabilities[hitPlayerId] += transitionProb;

                nextStates.push({
                    aliveIds: state.aliveIds.filter(id => id !== hitPlayerId),
                    prob: transitionProb
                });
            });
        });

        currentStates = nextStates;
    }

    const rateDetails = [];
    const playerNames = [];

    candidates.forEach(p => {
        const finalProb = hitProbabilities[p.id] || 0;
        const ratePercent = Math.round(finalProb * 1000) / 10;
        rateDetails.push(`${p.name}: ${ratePercent}%`);
        playerNames.push(p.name);
    });

    return { groupStr: playerNames.join(','), rateDetailStr: rateDetails.join(', ') };
}

function calculateWoodSwordSetGroupHitRates(candidates, myScore, attackCount = 1, isDarkness = false) {
    if (!candidates || candidates.length === 0) return { groupStr: '', rateDetailStr: '' };

    const hitProbabilities = {};
    candidates.forEach(p => hitProbabilities[p.id] = 0);

    let currentStates = [{ aliveIds: candidates.map(p => p.id), prob: 1.0 }];
    const darknessMult = isDarkness ? 0.5 : 1.0;
    const baseProb = 0.5 * darknessMult;

    for (let step = 0; step < attackCount; step++) {
        const nextStates = [];
        currentStates.forEach(state => {
            const aliveCandidates = candidates.filter(p => state.aliveIds.includes(p.id));
            if (aliveCandidates.length === 0) {
                nextStates.push(state);
                return;
            }

            const groups = [];
            const sorted = [...aliveCandidates].sort((a, b) => Math.abs(myScore - a.score) - Math.abs(myScore - b.score));
            sorted.forEach(p => {
                const diff = Math.abs(myScore - p.score);
                let last = groups[groups.length - 1];
                if (last && last.diff === diff) last.players.push(p);
                else groups.push({ diff, players: [p] });
            });

            const singleHitProb = {};
            let pMissCumulative = 1.0;

            groups.forEach(g => {
                const m = g.players.length;
                let r = baseProb;
                if (r <= 0 || m === 0) return;

                const pGroupAllMiss = Math.pow(1 - r, m);
                const pGroupHitTotal = pMissCumulative * (1 - pGroupAllMiss);
                const pIndividual = pGroupHitTotal / m;

                g.players.forEach(p => singleHitProb[p.id] = pIndividual);
                pMissCumulative *= pGroupAllMiss;
            });

            const totalHitProbInThisStep = Object.values(singleHitProb).reduce((a, b) => a + b, 0);
            const missProbInThisStep = 1 - totalHitProbInThisStep;

            if (missProbInThisStep > 0) {
                nextStates.push({ aliveIds: [...state.aliveIds], prob: state.prob * missProbInThisStep });
            }

            Object.keys(singleHitProb).forEach(hitPlayerId => {
                const pHit = singleHitProb[hitPlayerId];
                if (pHit <= 0) return;

                const transitionProb = state.prob * pHit;
                hitProbabilities[hitPlayerId] += transitionProb;

                nextStates.push({
                    aliveIds: state.aliveIds.filter(id => id !== hitPlayerId),
                    prob: transitionProb
                });
            });
        });

        currentStates = nextStates;
    }

    const rateDetails = [];
    const playerNames = [];

    candidates.forEach(p => {
        const finalProb = hitProbabilities[p.id] || 0;
        const ratePercent = Math.round(finalProb * 1000) / 10;
        rateDetails.push(`${p.name}: ${ratePercent}%`);
        playerNames.push(p.name);
    });

    return { groupStr: playerNames.join(','), rateDetailStr: rateDetails.join(', ') };
}

function updateHitRateDisplay(selectEl) {
    if (!selectEl) return;
    const displayEl = document.getElementById('hit-rate-info');
    if (!displayEl) return;

    const selectedOption = selectEl.options[selectEl.selectedIndex];
    if (!selectedOption) {
        displayEl.innerText = '';
        return;
    }

    const cardId = selectEl.getAttribute('data-card-id');
    const isDefense = (selectEl.id === 'drop-def-attack-target');

    const myPlayer = (latestGameState && myId) ? latestGameState.players[myId] : null;
    const isDarkness = myPlayer && myPlayer.darknessTurns > 0;
    const allPlayers = (latestGameState && latestGameState.players) ? Object.values(latestGameState.players) : [];

    // 1. 木の盾 / 木の盾セット
    if (cardId === 'wood_shield' || cardId === 'wood_shield_set') {
        let countSelect = isDefense ? document.getElementById('drop-def-attack-count') : document.getElementById(`drop-attack-count-${selectEl.id.replace(/^drop-target-/, '')}`);
        const attackCount = (cardId === 'wood_shield_set' && countSelect) ? (Number(countSelect.value) || 1) : 1;

        if (myPlayer) {
            const myScore = myPlayer.score;
            const validCandidates = allPlayers.filter(p => {
                if (p.id === myId || (p.immunityCount && p.immunityCount > 0) || isLaterPlayerInRound1(myId, p.id)) return false;
                return true;
            });

            let targetCandidates = [];
            if (selectEl.value === 'EQUAL_OR_HIGHER') {
                targetCandidates = validCandidates.filter(p => p.score >= myScore && Math.abs(myScore - p.score) < 10000);
            } else if (selectEl.value === 'LOWER') {
                targetCandidates = validCandidates.filter(p => p.score < myScore && Math.abs(myScore - p.score) < 10000);
            }

            if (targetCandidates.length > 0) {
                const { rateDetailStr } = calculateWoodShieldGroupHitRates(targetCandidates, myScore, attackCount, isDarkness);
                displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${rateDetailStr}${isDarkness ? ' (暗闇半減)' : ''}</span>`;
            } else {
                displayEl.innerHTML = `🎯 命中率: <span style="color:#94a3b8;">対象なし (0%)</span>`;
            }
            return;
        }
    }

    // 2. 青銅の盾 / 青銅の盾セット
    if (cardId === 'bronze_shield' || cardId === 'bronze_shield_set') {
        let countSelect = isDefense ? document.getElementById('drop-def-attack-count') : document.getElementById(`drop-attack-count-${selectEl.id.replace(/^drop-target-/, '')}`);
        const attackCount = (cardId === 'bronze_shield_set' && countSelect) ? (Number(countSelect.value) || 1) : 1;

        if (myPlayer) {
            const myScore = myPlayer.score;
            const validCandidates = allPlayers.filter(p => {
                if (p.id === myId || (p.immunityCount && p.immunityCount > 0) || isLaterPlayerInRound1(myId, p.id)) return false;
                return true;
            });

            if (selectEl.value === 'CLOSEST_HIGHER') {
                const higherCandidates = validCandidates.filter(p => (p.score - myScore) >= 0 && (p.score - myScore) <= 10000);
                if (higherCandidates.length > 0) {
                    const minDiff = Math.min(...higherCandidates.map(p => p.score - myScore));
                    const closestGroup = higherCandidates.filter(p => (p.score - myScore) === minDiff);
                    const m = closestGroup.length;

                    if (m === 1) {
                        displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">100% (必中)</span>`;
                    } else {
                        const prob = Math.min(1.0, attackCount / m);
                        const ratePercent = Math.round(prob * 1000) / 10;
                        const rateDetailStr = closestGroup.map(p => `${p.name}: ${ratePercent}%`).join(', ');
                        const countText = (cardId === 'bronze_shield_set' && attackCount > 1) ? ` (${attackCount}回連撃/実質選出率)` : ` (選出確率)`;
                        displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${rateDetailStr}${countText}</span>`;
                    }
                } else {
                    displayEl.innerHTML = `🎯 命中率: <span style="color:#94a3b8;">対象なし (0%)</span>`;
                }
                return;
            } else if (selectEl.value === 'LOWER') {
                const lowerCandidates = validCandidates.filter(p => p.score < myScore && (myScore - p.score) < 5000);
                if (lowerCandidates.length > 0) {
                    let res;
                    if (cardId === 'bronze_shield_set') {
                        res = calculateBronzeShieldSetGroupHitRates(lowerCandidates, myScore, attackCount, isDarkness);
                    } else {
                        res = calculateBronzeShieldGroupHitRates(lowerCandidates, myScore, isDarkness);
                    }
                    displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${res.rateDetailStr}${isDarkness ? ' (暗闇半減)' : ''}</span>`;
                } else {
                    displayEl.innerHTML = `🎯 命中率: <span style="color:#94a3b8;">対象なし (0%)</span>`;
                }
                return;
            }
        }
    }

    // 3. グレネード
    if (cardId === 'grenade') {
        if (selectEl.value === 'ALL_LOWER' && myPlayer) {
            const myScore = myPlayer.score;
            const candidates = allPlayers.filter(p => {
                if (p.id === myId || (p.immunityCount && p.immunityCount > 0) || isLaterPlayerInRound1(myId, p.id)) return false;
                const diff = myScore - p.score;
                return diff >= 1 && diff <= 5000;
            });
            if (candidates.length > 0) {
                const hitRates = calculateLowerTargetsHitRates(candidates, isDarkness);
                const rateDetailStr = hitRates.map(item => `${item.player.name}: ${item.hitRate}%`).join(', ');
                displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${rateDetailStr}${isDarkness ? ' (暗闇半減)' : ''}</span>`;
            } else {
                displayEl.innerHTML = `🎯 命中率: <span style="color:#94a3b8;">対象なし (0%)</span>`;
            }
            return;
        } else {
            const baseRate = isDarkness ? 0.25 : 0.5;
            displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${baseRate * 100}%${isDarkness ? ' (暗闇半減)' : ''}</span>`;
            return;
        }
    }

    // 4. 木の剣セット
    if (cardId === 'wood_sword_set') {
        let countSelect = isDefense ? document.getElementById('drop-def-attack-count') : document.getElementById(`drop-attack-count-${selectEl.id.replace(/^drop-target-/, '')}`);
        const attackCount = countSelect ? (Number(countSelect.value) || 1) : 1;

        if (selectEl.value === 'ALL_LOWER' && myPlayer) {
            const lowerCandidates = allPlayers.filter(p => p.score < myScore && (!p.immunityCount || p.immunityCount <= 0) && !isLaterPlayerInRound1(myId, p.id));
            if (lowerCandidates.length > 0) {
                const { rateDetailStr } = calculateWoodSwordSetGroupHitRates(lowerCandidates, myScore, attackCount, isDarkness);
                displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${rateDetailStr}${isDarkness ? ' (暗闇半減)' : ''}</span>`;
            } else {
                displayEl.innerHTML = `🎯 命中率: <span style="color:#94a3b8;">対象なし (0%)</span>`;
            }
            return;
        } else {
            const baseRate = isDarkness ? 0.25 : 0.5;
            const cumulativeHitRate = (1 - Math.pow(1 - baseRate, attackCount));
            const ratePercent = Math.round(cumulativeHitRate * 1000) / 10;
            displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${ratePercent}% (${attackCount}回攻撃)${isDarkness ? ' (暗闇半減)' : ''}</span>`;
            return;
        }
    }

    // 5. 木の剣 / ショットガン
    if (cardId === 'wood_sword' || cardId === 'shotgun') {
        if (selectEl.value === 'ALL_LOWER' && myPlayer) {
            const myScore = myPlayer.score;
            const lowerCandidates = allPlayers.filter(p => p.score < myScore && (!p.immunityCount || p.immunityCount <= 0) && !isLaterPlayerInRound1(myId, p.id));
            if (lowerCandidates.length > 0) {
                const hitRates = calculateLowerTargetsHitRates(lowerCandidates, isDarkness);
                const rateDetailStr = hitRates.map(item => `${item.player.name}: ${item.hitRate}%`).join(', ');
                displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${rateDetailStr}${isDarkness ? ' (暗闇半減)' : ''}</span>`;
            } else {
                displayEl.innerHTML = `🎯 命中率: <span style="color:#94a3b8;">対象なし (0%)</span>`;
            }
            return;
        } else {
            const baseRate = isDarkness ? 0.25 : 0.5;
            displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${baseRate * 100}%${isDarkness ? ' (暗闇半減)' : ''}</span>`;
            return;
        }
    }

    // 6. 単体指定のフォールバック
    const rawRateInfo = selectedOption.getAttribute('data-hitrate');
    if (rawRateInfo) {
        let displayStr = rawRateInfo;
        if (isDarkness) {
            displayStr = rawRateInfo.replace(/(\d+(\.\d+)?)%/g, (match, p1) => {
                return `${(parseFloat(p1) / 2).toFixed(1).replace(/\.0$/, '')}%`;
            }) + ' (暗闇半減)';
        }
        displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${displayStr}</span>`;
    } else {
        displayEl.innerHTML = '';
    }
}

function executeDropPlayCard(instanceId, actionTarget) {
    const targetSelect = document.getElementById(`drop-target-${instanceId}`);
    const countSelect = document.getElementById(`drop-attack-count-${instanceId}`);

    const targetPlayerId = targetSelect ? targetSelect.value : null;
    const attackCount = countSelect ? Number(countSelect.value) : 1;

    socket.emit('playCard', {
        instanceId: instanceId,
        actionTarget: actionTarget,
        targetPlayerId: targetPlayerId,
        attackCount: attackCount
    });

    closeDropActionModal();
}

function executeDropDefenseAttack() {
    const targetSelect = document.getElementById('drop-def-attack-target');
    const countSelect = document.getElementById('drop-def-attack-count');

    const targetPlayerId = targetSelect ? targetSelect.value : null;
    const attackCount = countSelect ? Number(countSelect.value) : 1;

    socket.emit('playDefenseAsAttack', {
        targetPlayerId: targetPlayerId,
        attackCount: attackCount
    });

    closeDropActionModal();
}

function openDropCardModal(source, instanceId) {
    if (!latestGameState) return;

    const currentTurnId = latestGameState.currentTurnPlayerId;
    if (myId !== currentTurnId || latestGameState.turnPhase !== 'MAIN') return;

    const myPlayer = latestGameState.players[myId];
    if (!myPlayer) return;

    let isBlockedByDefense = false;

    if (source === 'HAND') {
        const targetHandCard = myPlayer.hand.find(c => String(c.instanceId) === String(instanceId));
        if (myPlayer.defenseCard && targetHandCard && !targetHandCard.allowWithDefense) {
            isBlockedByDefense = true;
            source = 'DEFENSE';
        }
    }

    const modal = document.getElementById('drop-action-modal');
    const preview = document.getElementById('drop-modal-card-preview');
    const actions = document.getElementById('drop-modal-actions');
    const title = document.getElementById('drop-modal-title');

    preview.innerHTML = '';
    actions.innerHTML = '';

    let card = null;
    let usesLeft = 1;

    if (source === 'HAND') {
        card = myPlayer.hand.find(c => String(c.instanceId) === String(instanceId));
        usesLeft = card ? ((card.id === 'wood_shield_set' || card.id === 'bronze_shield_set' || card.id === 'wood_sword_set' || card.id === 'omamori_koban_set') ? (card.usesLeft || 3) : 1) : 1;
    } else if (source === 'DEFENSE') {
        if (myPlayer.defenseCard) {
            card = myPlayer.defenseCard.card;
            usesLeft = myPlayer.defenseCard.usesLeft;
        }
    }

    if (!card) return;

    if (isBlockedByDefense) {
        title.innerHTML = `<span style="color:#e74c3c; font-size:0.9em; display:block; margin-bottom:4px;">防御カードがセットされています</span>【防御カード操作】${card.name}`;
    } else {
        title.innerText = source === 'HAND' ? `【手札操作】${card.name}` : `【防御カード操作】${card.name}`;
    }

    const descText = getFormattedCardDesc(card, usesLeft);

    preview.innerHTML = `
        ${card.image ? `<img src="${card.image}" style="width:110px; height:160px; object-fit:contain; border-radius:6px; margin:0 auto; display:block;">` : ''}
        <p style="font-size:0.85em; color:#cbd5e1; margin:8px 0 0 0; white-space:pre-line;">${descText}</p>
    `;

    const hasDefense = !!myPlayer.defenseCard;
    let html = '';

    const hasUsedOban = myPlayer.playedObanThisTurn;
    const hasUsedDarkMatter = myPlayer.playedDarkMatterThisTurn;
    const hasUsedOtherCard = myPlayer.playedHandCardThisTurn && !hasUsedOban && !hasUsedDarkMatter;

    if (source === 'HAND') {
        if (hasUsedOban) {
            html += `
                <div style="background:#1a252f; padding:10px; border-radius:6px; margin-bottom:10px; text-align:center;">
                    <div style="color:#e74c3c; font-weight:bold; font-size:0.9em; margin-bottom:6px;">※「お守り大判」を使用したため発動できません</div>
                    <button class="btn" disabled style="background:#7f8c8d; width:100%; cursor:not-allowed;">使用不可</button>
                </div>
            `;
        } else if (hasUsedDarkMatter) {
            html += `
                <div style="background:#1a252f; padding:10px; border-radius:6px; margin-bottom:10px; text-align:center;">
                    <div style="color:#e74c3c; font-weight:bold; font-size:0.9em; margin-bottom:6px;">※「ダークマター」を使用したため発動できません</div>
                    <button class="btn" disabled style="background:#7f8c8d; width:100%; cursor:not-allowed;">使用不可</button>
                </div>
            `;
        } else if (card.id === 'omamori_oban') {
            if (hasUsedOtherCard) {
                html += `
                    <div style="background:#1a252f; padding:10px; border-radius:6px; margin-bottom:10px; text-align:center;">
                        <div style="color:#e74c3c; font-weight:bold; font-size:0.9em; margin-bottom:6px;">※他のカードを使用したため発動できません</div>
                        <button class="btn" disabled style="background:#7f8c8d; width:100%; cursor:not-allowed;">お守り大判を使用する</button>
                    </div>
                `;
            } else {
                let scoreOptions = '';
                for (let s = 8000; s >= 3000; s -= 1000) {
                    scoreOptions += `<option value="${s}" ${s === 8000 ? 'selected' : ''}>+${s.toLocaleString()}点</option>`;
                }
                html += `
                    <div style="background:#1a252f; padding:10px; border-radius:6px; margin-bottom:10px; text-align:left;">
                        <b style="color:#f39c12;">💰 獲得得点を選択:</b><br>
                        得点: <select id="drop-oban-score-${card.instanceId}" style="padding:4px; background:#334155; color:#fff; border:1px solid #475569; border-radius:4px; margin:6px 0;">${scoreOptions}</select><br>
                        <button class="btn" style="background:#f39c12; color:#fff; font-size:1.05em; width:100%; font-weight:bold; margin-top:5px;" onclick="executeUseOban('${card.instanceId}')">お守り大判を使用する</button>
                    </div>
                `;
            }
        } else if (card.id === 'dark_matter') {
            if (hasUsedOtherCard) {
                html += `
                    <div style="background:#1a252f; padding:10px; border-radius:6px; margin-bottom:10px; text-align:center;">
                        <div style="color:#e74c3c; font-weight:bold; font-size:0.9em; margin-bottom:6px;">※他のカードを使用したため発動できません</div>
                        <button class="btn" disabled style="background:#7f8c8d; width:100%; cursor:not-allowed;">ダークマターを使用する</button>
                    </div>
                `;
            } else {
                const allPlayers = Object.values(latestGameState.players);
                const prevMyScore = myPlayer.score;
                const newMyScore = prevMyScore + 5000;

                const penaltyTargets = allPlayers.filter(p => {
                    if (p.id === myId || isLaterPlayerInRound1(myId, p.id) || p.invincibleTurns > 0 || (p.immunityCount && p.immunityCount > 0)) return false;
                    return (p.score === prevMyScore) || (p.score > prevMyScore && newMyScore >= p.score);
                });

                if (penaltyTargets.length === 0) {
                    html += `<div style="color:#94a3b8; font-size:0.85em; margin-bottom:8px;">※使用時に条件を満たす相手はいません（ペナルティなし）</div>`;
                } else {
                    const targetNames = penaltyTargets.map(p => p.name).join(', ');
                    html += `<div style="color:#38bdf8; font-size:0.85em; margin-bottom:8px;">ペナルティ対象(50%): <b>${targetNames}</b></div>`;
                }
                html += `<button class="btn" style="background:#8e44ad; color:#fff; font-size:1.05em; width:100%; font-weight:bold;" onclick="socket.emit('playCard', { instanceId: '${card.instanceId}' }); closeDropActionModal();">ダークマターを使用する</button>`;
            }
        } else if (card.id === 'omamori_koban') {
            html += `<button class="btn" style="background:#f39c12; color:#fff; font-size:1.05em; width:100%; font-weight:bold;" onclick="socket.emit('playCard', { instanceId: '${card.instanceId}' }); closeDropActionModal();">お守り小判を使用する (+3,000点)</button>`;
        } else if (card.id === 'omamori_koban_set') {
            const maxUses = card.usesLeft || 3;
            let countOptions = '';
            for (let i = maxUses; i >= 1; i--) {
                countOptions += `<option value="${i}">${i}回分消費 (+${(i * 2000).toLocaleString()}点)</option>`;
            }
            html += `
                <div style="background:#1a252f; padding:10px; border-radius:6px; margin-bottom:10px; text-align:left;">
                    <b style="color:#f39c12;">💰 使用回数を指定して発動:</b><br>
                    消費回数: <select id="drop-koban-count-${card.instanceId}" style="padding:4px; background:#334155; color:#fff; border:1px solid #475569; border-radius:4px; margin:6px 0;">${countOptions}</select><br>
                    <button class="btn" style="background:#f39c12; color:#fff; font-size:1.05em; width:100%; font-weight:bold; margin-top:5px;" onclick="executeUseKobanSet('${card.instanceId}')">お守り小判セットを使用する</button>
                </div>
            `;
        } else if (card.id === 'disaster') {
            html += `<button class="btn" style="background:#c0392b; font-size:1.05em; width:100%; font-weight:bold;" onclick="socket.emit('playCard', { instanceId: '${card.instanceId}' }); closeDropActionModal();">大災害を発動する</button>`;
        } else if (card.id === 'diamond_sword') {
            const allPlayers = Object.values(latestGameState.players);
            const maxScore = Math.max(...allPlayers.map(p => p.score));
            const targetPlayers = allPlayers.filter(p => {
                if (p.id !== myId && isLaterPlayerInRound1(myId, p.id)) return false;
                return Math.abs(maxScore - p.score) <= 1000;
            });

            if (targetPlayers.length === 0) {
                html += `<div style="color:#e74c3c; font-size:0.85em; font-weight:bold; margin-bottom:8px;">※現在、対象となるプレイヤーが存在しません</div>`;
            } else {
                const targetNames = targetPlayers.map(p => (p.id === myId ? `${p.name}(あなた)` : p.name)).join(', ');
                html += `<div style="color:#38bdf8; font-size:0.85em; margin-bottom:8px;">攻撃対象 (1位±1,000点): <b>${targetNames}</b></div>`;
            }
            html += `<button class="btn" style="background:#0ea5e9; color:#fff; font-size:1.05em; width:100%; font-weight:bold;" onclick="socket.emit('playCard', { instanceId: '${card.instanceId}' }); closeDropActionModal();">ダイヤの剣を発動する</button>`;
        } else if (card.id === 'earthquake') {
            const allPlayers = Object.values(latestGameState.players);
            const higherTargets = allPlayers.filter(p => p.id !== myId && p.score >= myPlayer.score && !isLaterPlayerInRound1(myId, p.id));

            if (higherTargets.length === 0) {
                html += `<div style="color:#e74c3c; font-size:0.85em; font-weight:bold; margin-bottom:8px;">※現在、同点以上の相手が存在しません（使用しても不発になります）</div>`;
            } else {
                const targetNames = higherTargets.map(p => p.name).join(', ');
                html += `<div style="color:#38bdf8; font-size:0.85em; margin-bottom:8px;">同点以上の対象: <b>${targetNames}</b></div>`;
            }
            html += `<button class="btn" style="background:#d35400; color:#fff; font-size:1.05em; width:100%; font-weight:bold;" onclick="socket.emit('playCard', { instanceId: '${card.instanceId}' }); closeDropActionModal();">地震を発動する</button>`;
        } else if (card.id === 'invincible_armor') {
            html += `<button class="btn" style="background:#f1c40f; color:#000; font-size:1.05em; width:100%; font-weight:bold;" onclick="socket.emit('playCard', { instanceId: '${card.instanceId}' }); closeDropActionModal();">無敵アーマーを使用する</button>`;
        } else if (card.id === 'steroid') {
            html += `<button class="btn" style="background:#e67e22; color:#fff; font-size:1.05em; width:100%; font-weight:bold;" onclick="socket.emit('playCard', { instanceId: '${card.instanceId}' }); closeDropActionModal();">ステロイドを使用する</button>`;
        } else if (card.id === 'smoke_screen') {
            const allPlayers = Object.values(latestGameState.players);
            const myScore = myPlayer.score;
            const higherTargets = allPlayers.filter(p => p.id !== myId && p.score >= myScore && !isLaterPlayerInRound1(myId, p.id));

            if (higherTargets.length === 0) {
                html += `<div style="color:#e74c3c; font-size:0.85em; font-weight:bold; margin-bottom:8px;">※同点以上の相手がいないため、自身に効果が発動します (-1,000点＆暗闇)</div>`;
            } else {
                const targetNames = higherTargets.map(p => p.name).join(', ');
                html += `<div style="color:#38bdf8; font-size:0.85em; margin-bottom:8px;">効果対象 (同点以上): <b>${targetNames}</b></div>`;
            }
            html += `<button class="btn" style="background:#7f8c8d; color:#fff; font-size:1.05em; width:100%; font-weight:bold;" onclick="socket.emit('playCard', { instanceId: '${card.instanceId}' }); closeDropActionModal();">煙幕を使用する</button>`;
        } else {
            let targetOptionsHtml = '';
            let hasValidTarget = false;

            if (card.id === 'wood_shield' || card.id === 'wood_shield_set') {
                const allPlayers = Object.values(latestGameState.players);
                const myScore = myPlayer.score;
                const validCandidates = allPlayers.filter(p => p.id !== myId && (!p.immunityCount || p.immunityCount <= 0) && !isLaterPlayerInRound1(myId, p.id));
                const hitCandidates = validCandidates.filter(p => Math.abs(myScore - p.score) < 10000);
                const equalOrHigher = hitCandidates.filter(p => p.score >= myScore);
                const lower = hitCandidates.filter(p => p.score < myScore);

                if (equalOrHigher.length > 0) {
                    hasValidTarget = true;
                    const { groupStr, rateDetailStr } = calculateWoodShieldGroupHitRates(equalOrHigher, myScore, 1, myPlayer.darknessTurns > 0);
                    targetOptionsHtml += `<option value="EQUAL_OR_HIGHER" data-hitrate="${rateDetailStr}">同点以上 (${groupStr})</option>`;
                }
                if (lower.length > 0) {
                    hasValidTarget = true;
                    const { groupStr, rateDetailStr } = calculateWoodShieldGroupHitRates(lower, myScore, 1, myPlayer.darknessTurns > 0);
                    targetOptionsHtml += `<option value="LOWER" data-hitrate="${rateDetailStr}">下位全員 (${groupStr})</option>`;
                }
            } else if (card.id === 'bronze_shield' || card.id === 'bronze_shield_set') {
                const allPlayers = Object.values(latestGameState.players);
                const myScore = myPlayer.score;
                const validCandidates = allPlayers.filter(p => p.id !== myId && (!p.immunityCount || p.immunityCount <= 0) && !isLaterPlayerInRound1(myId, p.id));
                const higherCandidates = validCandidates.filter(p => (p.score - myScore) >= 0 && (p.score - myScore) <= 10000);

                if (higherCandidates.length > 0) {
                    hasValidTarget = true;
                    const minDiff = Math.min(...higherCandidates.map(p => p.score - myScore));
                    const closestGroup = higherCandidates.filter(p => (p.score - myScore) === minDiff);
                    const indivRate = Math.round((100 / closestGroup.length) * 10) / 10;
                    const rateDetailStr = closestGroup.map(p => `${p.name}: ${indivRate}%`).join(', ');
                    targetOptionsHtml += `<option value="CLOSEST_HIGHER" data-hitrate="${rateDetailStr}">同点以上最寄 (${closestGroup.map(p => p.name).join('/')})</option>`;
                }

                const lowerCandidates = validCandidates.filter(p => p.score < myScore && (myScore - p.score) < 5000);
                if (lowerCandidates.length > 0) {
                    hasValidTarget = true;
                    const isDarkness = myPlayer.darknessTurns > 0;
                    let res;
                    if (card.id === 'bronze_shield_set') {
                        res = calculateBronzeShieldSetGroupHitRates(lowerCandidates, myScore, 1, isDarkness);
                    } else {
                        res = calculateBronzeShieldGroupHitRates(lowerCandidates, myScore, isDarkness);
                    }
                    targetOptionsHtml += `<option value="LOWER" data-hitrate="${res.rateDetailStr}">下位全員 (${res.groupStr})</option>`;
                }
            } else if (card.id === 'grenade') {
                const allPlayers = Object.values(latestGameState.players);
                const myScore = myPlayer.score;

                allPlayers.forEach((p) => {
                    if (p.id !== myId) {
                        const scoreDiff = p.score - myScore;
                        const isImmune = p.immunityCount && p.immunityCount > 0;
                        if (!isLaterPlayerInRound1(myId, p.id) && scoreDiff >= 0 && scoreDiff <= 5000 && !isImmune) {
                            hasValidTarget = true;
                            targetOptionsHtml += `<option value="${p.id}" data-hitrate="50%">${p.name}</option>`;
                        }
                    }
                });

                const lowerCandidates = allPlayers.filter(p => p.id !== myId && (!p.immunityCount || p.immunityCount <= 0) && !isLaterPlayerInRound1(myId, p.id) && (myScore - p.score) >= 1 && (myScore - p.score) <= 5000);
                if (lowerCandidates.length > 0) {
                    hasValidTarget = true;
                    const hitRates = calculateLowerTargetsHitRates(lowerCandidates, myPlayer.darknessTurns > 0);
                    targetOptionsHtml += `<option value="ALL_LOWER" data-hitrate="${hitRates.map(item => `${item.player.name}: ${item.hitRate}%`).join(', ')}">下位全員 (${lowerCandidates.map(p => p.name).join(',')})</option>`;
                }
            } else if (card.id === 'wood_sword' || card.id === 'wood_sword_set' || card.id === 'shotgun') {
                const allPlayers = Object.values(latestGameState.players);
                const myScore = myPlayer.score;

                allPlayers.forEach((p) => {
                    if (p.id !== myId) {
                        const scoreDiff = p.score - myScore;
                        const isImmune = p.immunityCount && p.immunityCount > 0;
                        if (!isLaterPlayerInRound1(myId, p.id) && scoreDiff >= 0 && scoreDiff <= 5000 && !isImmune) {
                            hasValidTarget = true;
                            targetOptionsHtml += `<option value="${p.id}" data-hitrate="50%">${p.name}</option>`;
                        }
                    }
                });

                let lowerPlayers = allPlayers.filter(p => p.score < myScore && (!p.immunityCount || p.immunityCount <= 0) && !isLaterPlayerInRound1(myId, p.id));
                if (lowerPlayers.length > 0) {
                    hasValidTarget = true;
                    const isDarkness = myPlayer.darknessTurns > 0;
                    if (card.id === 'wood_sword_set') {
                        const { rateDetailStr, groupStr } = calculateWoodSwordSetGroupHitRates(lowerPlayers, myScore, 1, isDarkness);
                        targetOptionsHtml += `<option value="ALL_LOWER" data-hitrate="${rateDetailStr}">下位全員 (${groupStr})</option>`;
                    } else {
                        const hitRates = calculateLowerTargetsHitRates(lowerPlayers, isDarkness);
                        targetOptionsHtml += `<option value="ALL_LOWER" data-hitrate="${hitRates.map(item => `${item.player.name}: ${item.hitRate}%`).join(', ')}">下位全員 (${lowerPlayers.map(p => p.name).join(',')})</option>`;
                    }
                }
            }

            html += `<div style="background:#1a252f; padding:10px; border-radius:6px; margin-bottom:10px; text-align:left;">`;
            html += `<b style="color:#e74c3c;">⚔ 攻撃する:</b><br>`;
            const isSetCard = (card.id === 'wood_shield_set' || card.id === 'bronze_shield_set' || card.id === 'wood_sword_set');

            if (!hasValidTarget) {
                html += `<div style="color:#e74c3c; font-size:0.85em; font-weight:bold; margin:4px 0;">対象が存在しません</div>`;
                html += `対象: <select id="drop-target-${card.instanceId}" disabled style="background:#334155; color:#94a3b8; cursor:not-allowed;"></select><br>`;
                html += `<div id="hit-rate-info" style="font-size:0.85em; margin-top:4px; min-height:1.2em;"></div>`;
                if (isSetCard) {
                    html += `回数: <select id="drop-attack-count-${card.instanceId}" disabled style="background:#334155; color:#94a3b8; cursor:not-allowed;">`;
                    for (let i = 1; i <= usesLeft; i++) html += `<option value="${i}">${i}回</option>`;
                    html += `</select><br>`;
                }
                html += `<button class="btn" disabled style="background:#7f8c8d; margin-top:5px; width:100%; cursor:not-allowed;">攻撃実行</button>`;
            } else {
                html += `対象: <select id="drop-target-${card.instanceId}" data-card-id="${card.id}" onchange="updateHitRateDisplay(this)">${targetOptionsHtml}</select><br>`;
                html += `<div id="hit-rate-info" style="font-size:0.85em; margin-top:4px; min-height:1.2em;"></div>`;
                if (isSetCard) {
                    html += `回数: <select id="drop-attack-count-${card.instanceId}" onchange="updateHitRateDisplay(document.getElementById('drop-target-${card.instanceId}'))">`;
                    for (let i = 1; i <= usesLeft; i++) html += `<option value="${i}">${i}回</option>`;
                    html += `</select><br>`;
                }
                html += `<button class="btn" style="background:#e74c3c; margin-top:5px; width:100%;" onclick="executeDropPlayCard('${card.instanceId}', 'ATTACK')">攻撃実行</button>`;
            }
            html += `</div>`;

            if (card.id !== 'shotgun') {
                html += `<div style="margin-bottom:8px;">`;
                if (hasDefense) {
                    html += `<button class="btn" disabled style="background:#7f8c8d; width:100%;">防御にセット不可 (すでにセット中)</button>`;
                } else {
                    html += `<button class="btn" style="background:#2980b9; width:100%;" onclick="socket.emit('playCard', { instanceId: '${card.instanceId}', actionTarget: 'DEFENSE' }); closeDropActionModal();">防御にセット</button>`;
                }
                html += `</div>`;
            }
        }
    } else if (source === 'DEFENSE') {
        let targetOptionsHtml = '';
        let hasValidTarget = false;

        if (card.id === 'wood_shield' || card.id === 'wood_shield_set') {
            const allPlayers = Object.values(latestGameState.players);
            const myScore = myPlayer.score;
            const validCandidates = allPlayers.filter(p => p.id !== myId && (!p.immunityCount || p.immunityCount <= 0) && !isLaterPlayerInRound1(myId, p.id));
            const hitCandidates = validCandidates.filter(p => Math.abs(myScore - p.score) < 10000);
            const equalOrHigher = hitCandidates.filter(p => p.score >= myScore);
            const lower = hitCandidates.filter(p => p.score < myScore);

            if (equalOrHigher.length > 0) {
                hasValidTarget = true;
                const { groupStr, rateDetailStr } = calculateWoodShieldGroupHitRates(equalOrHigher, myScore, 1, myPlayer.darknessTurns > 0);
                targetOptionsHtml += `<option value="EQUAL_OR_HIGHER" data-hitrate="${rateDetailStr}">同点以上 (${groupStr})</option>`;
            }
            if (lower.length > 0) {
                hasValidTarget = true;
                const { groupStr, rateDetailStr } = calculateWoodShieldGroupHitRates(lower, myScore, 1, myPlayer.darknessTurns > 0);
                targetOptionsHtml += `<option value="LOWER" data-hitrate="${rateDetailStr}">下位全員 (${groupStr})</option>`;
            }
        } else if (card.id === 'bronze_shield' || card.id === 'bronze_shield_set') {
            const allPlayers = Object.values(latestGameState.players);
            const myScore = myPlayer.score;
            const validCandidates = allPlayers.filter(p => p.id !== myId && (!p.immunityCount || p.immunityCount <= 0) && !isLaterPlayerInRound1(myId, p.id));
            const higherCandidates = validCandidates.filter(p => (p.score - myScore) >= 0 && (p.score - myScore) <= 10000);

            if (higherCandidates.length > 0) {
                hasValidTarget = true;
                const minDiff = Math.min(...higherCandidates.map(p => p.score - myScore));
                const closestGroup = higherCandidates.filter(p => (p.score - myScore) === minDiff);
                const indivRate = Math.round((100 / closestGroup.length) * 10) / 10;
                const rateDetailStr = closestGroup.map(p => `${p.name}: ${indivRate}%`).join(', ');
                targetOptionsHtml += `<option value="CLOSEST_HIGHER" data-hitrate="${rateDetailStr}">同点以上最寄 (${closestGroup.map(p => p.name).join('/')})</option>`;
            }

            const lowerCandidates = validCandidates.filter(p => p.score < myScore && (myScore - p.score) < 5000);
            if (lowerCandidates.length > 0) {
                hasValidTarget = true;
                const isDarkness = myPlayer.darknessTurns > 0;
                let res;
                if (card.id === 'bronze_shield_set') {
                    res = calculateBronzeShieldSetGroupHitRates(lowerCandidates, myScore, 1, isDarkness);
                } else {
                    res = calculateBronzeShieldGroupHitRates(lowerCandidates, myScore, isDarkness);
                }
                targetOptionsHtml += `<option value="LOWER" data-hitrate="${res.rateDetailStr}">下位全員 (${res.groupStr})</option>`;
            }
        } else if (card.id === 'grenade') {
            const allPlayers = Object.values(latestGameState.players);
            const myScore = myPlayer.score;

            allPlayers.forEach((p) => {
                if (p.id !== myId) {
                    const scoreDiff = p.score - myScore;
                    const isImmune = p.immunityCount && p.immunityCount > 0;
                    if (!isLaterPlayerInRound1(myId, p.id) && scoreDiff >= 0 && scoreDiff <= 5000 && !isImmune) {
                        hasValidTarget = true;
                        targetOptionsHtml += `<option value="${p.id}" data-hitrate="50%">${p.name}</option>`;
                    }
                }
            });

            const lowerCandidates = allPlayers.filter(p => p.id !== myId && (!p.immunityCount || p.immunityCount <= 0) && !isLaterPlayerInRound1(myId, p.id) && (myScore - p.score) >= 1 && (myScore - p.score) <= 5000);
            if (lowerCandidates.length > 0) {
                hasValidTarget = true;
                const hitRates = calculateLowerTargetsHitRates(lowerCandidates, myPlayer.darknessTurns > 0);
                targetOptionsHtml += `<option value="ALL_LOWER" data-hitrate="${hitRates.map(item => `${item.player.name}: ${item.hitRate}%`).join(', ')}">下位全員 (${lowerCandidates.map(p => p.name).join(',')})</option>`;
            }
        } else if (card.id === 'wood_sword' || card.id === 'wood_sword_set') {
            const allPlayers = Object.values(latestGameState.players);
            const myScore = myPlayer.score;

            allPlayers.forEach((p) => {
                if (p.id !== myId) {
                    const scoreDiff = p.score - myScore;
                    const isImmune = p.immunityCount && p.immunityCount > 0;
                    if (!isLaterPlayerInRound1(myId, p.id) && scoreDiff >= 0 && scoreDiff <= 5000 && !isImmune) {
                        hasValidTarget = true;
                        targetOptionsHtml += `<option value="${p.id}" data-hitrate="50%">${p.name}</option>`;
                    }
                }
            });

            let lowerPlayers = allPlayers.filter(p => p.score < myScore && (!p.immunityCount || p.immunityCount <= 0) && !isLaterPlayerInRound1(myId, p.id));
            if (lowerPlayers.length > 0) {
                hasValidTarget = true;
                const isDarkness = myPlayer.darknessTurns > 0;
                if (card.id === 'wood_sword_set') {
                    const { rateDetailStr, groupStr } = calculateWoodSwordSetGroupHitRates(lowerPlayers, myScore, 1, isDarkness);
                    targetOptionsHtml += `<option value="ALL_LOWER" data-hitrate="${rateDetailStr}">下位全員 (${groupStr})</option>`;
                } else {
                    const hitRates = calculateLowerTargetsHitRates(lowerPlayers, isDarkness);
                    targetOptionsHtml += `<option value="ALL_LOWER" data-hitrate="${hitRates.map(item => `${item.player.name}: ${item.hitRate}%`).join(', ')}">下位全員 (${lowerPlayers.map(p => p.name).join(',')})</option>`;
                }
            }
        }

        html += `<div style="background:#1a252f; padding:10px; border-radius:6px; margin-bottom:10px; text-align:left;">`;
        html += `<b style="color:#e74c3c;">⚔ 防御を外して攻撃:</b><br>`;
        const isSetCard = (card.id === 'wood_shield_set' || card.id === 'bronze_shield_set' || card.id === 'wood_sword_set');

        if (!hasValidTarget) {
            html += `<div style="color:#e74c3c; font-size:0.85em; font-weight:bold; margin:4px 0;">対象が存在しません</div>`;
            html += `対象: <select id="drop-def-attack-target" disabled style="background:#334155; color:#94a3b8; cursor:not-allowed;"></select><br>`;
            html += `<div id="hit-rate-info" style="font-size:0.85em; margin-top:4px; min-height:1.2em;"></div>`;
            if (isSetCard) {
                html += `回数: <select id="drop-def-attack-count" disabled style="background:#334155; color:#94a3b8; cursor:not-allowed;">`;
                for (let i = 1; i <= usesLeft; i++) html += `<option value="${i}">${i}回</option>`;
                html += `</select><br>`;
            }
            html += `<button class="btn" disabled style="background:#7f8c8d; margin-top:5px; width:100%; cursor:not-allowed;">攻撃実行</button>`;
        } else {
            html += `対象: <select id="drop-def-attack-target" data-card-id="${card.id}" onchange="updateHitRateDisplay(this)">${targetOptionsHtml}</select><br>`;
            html += `<div id="hit-rate-info" style="font-size:0.85em; margin-top:4px; min-height:1.2em;"></div>`;
            if (isSetCard) {
                html += `回数: <select id="drop-def-attack-count" onchange="updateHitRateDisplay(document.getElementById('drop-def-attack-target'))">`;
                for (let i = 1; i <= usesLeft; i++) html += `<option value="${i}">${i}回</option>`;
                html += `</select><br>`;
            }
            html += `<button class="btn" style="background:#e74c3c; margin-top:5px; width:100%;" onclick="executeDropDefenseAttack()">攻撃実行</button>`;
        }
        html += `</div>`;
        html += `<button class="btn" style="background:#c0392b; width:100%;" onclick="socket.emit('discardDefense'); closeDropActionModal();">セット解除（破棄）</button>`;
    }

    actions.innerHTML = html;
    modal.style.display = 'flex';

    const firstTargetSelect = actions.querySelector('select[data-card-id]');
    if (firstTargetSelect) {
        updateHitRateDisplay(firstTargetSelect);
    }
}