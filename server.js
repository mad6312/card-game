const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const CARD_DECK = [
    {
        id: 'wood_shield',
        name: '木の盾',
        category: 'DEFENSE',
        image: '/images/wood_shield.png',
        desc: '攻撃: 同点以上または下位全員から選択(差に応じた命中率/ヒットで-3000&選択不可&中断) / 防御: 攻撃を1度無効'
    },
    {
        id: 'wood_shield_set',
        name: '木の盾セット',
        category: 'DEFENSE',
        image: '/images/wood_shield_set.png',
        desc: '攻撃: 同点以上または下位全員(差に応じた命中率/順次判定/ヒット・無効化で回数消費) / 防御: 攻撃を無効(計3回で破棄)'
    },
    {
        id: 'bronze_shield',
        name: '青銅の盾',
        category: 'DEFENSE',
        image: '/images/bronze_shield.png',
        desc: '<span style="color:#e74c3c; font-weight:bold;">【攻撃】</span>\n【対象】自分以上で最も点差が近い相手1名 または 自分より得点が下の相手全員\n【効果】対象に3000点ダメージを与える。\n【命中率】\n上：100%\n下：100-(得点差/50)%\n\n<span style="color:#3498db; font-weight:bold;">【防御】</span>\n【効果】一部を除く相手からの攻撃を1回無効化する。'
    },
    {
        id: 'wood_sword',
        name: '木の剣',
        category: 'ATTACK',
        image: '/images/wood_sword.png',
        desc: '攻撃: 自分より上位なら単体(5000点差以内/成功率1/2)、下位なら全員順次判定(成功率1/2) / 防御: 攻撃を1度無効(高得点者からの攻撃は無効化不可)'
    },
    {
        id: 'wood_sword_set',
        name: '木の剣セット',
        category: 'ATTACK',
        image: '/images/wood_sword_set.png',
        desc: '攻撃: 自分より上位なら単体(5000点差以内/成功率1/2)、下位なら全員順次判定(成功率1/2/指定回数攻撃) / 防御: 攻撃を無効(計3回で破棄/高得点者からの攻撃は無効化不可)'
    },
    {
        id: 'shotgun',
        name: 'ショットガン',
        category: 'ATTACK',
        image: '/images/shotgun.png',
        desc: '<span style="color:#e74c3c; font-weight:bold;">【攻撃】</span>\n【対象】自分との得点差が+5000点以内の相手1人 または 自分より得点が下の相手全員\n【効果】対象に3000点ダメージを与える。このカードによる攻撃は防御カードを貫通する。\n【命中率】50%'
    },
    {
        id: 'grenade',
        name: 'グレネード',
        category: 'ATTACK',
        image: '/images/grenade.png',
        desc: '<span style="color:#e74c3c; font-weight:bold;">【攻撃】</span>\n【対象】自分との得点差が+5000点以内の相手1人 または 自分との得点差が-5000点以内の相手全員\n【追加対象】上記対象との得点差が1000点以内のプレイヤー（自分も含む）\n【効果】対象の手札・防御カードをすべて破棄し、さらに5000点ダメージを与える。このカードによる攻撃は防御カードを貫通する。\n【命中率】\n上：50%\n下：80%\n\n<span style="color:#3498db; font-weight:bold;">【防御】</span>\n【効果】一部を除く相手からの攻撃を1回無効化する。ただし、自分より得点が高い相手からの攻撃を無効化することはできない。\n【追加効果】無効化時、自分との得点差が-1000点以内の相手全員の手札・防御カードをすべて破棄し、さらに5000点ダメージを与える。'
    },
    {
        id: 'diamond_sword',
        name: 'ダイヤの剣',
        category: 'ATTACK',
        image: '/images/diamond_sword.png',
        desc: '【対象】1位、および1位と得点差が±1000点以内のプレイヤー全員（自分も含む）\n【効果】対象の手札と防御カードをすべて捨て、5000点ダメージを与える。（必中/無敵・ステロイド・選択不可は防御破棄のみ）'
    },
    {
        id: 'earthquake',
        name: '地震',
        category: 'ATTACK',
        image: '/images/earthquake.png',
        desc: '【使用時】自分と同点以上の相手全員に1000点/3000点(各50%)ダメージを与える。\n【追加効果】対象の手札・防御カードをすべて破棄する。'
    },
    {
        id: 'time_bomb',
        name: '時限爆弾',
        category: 'SPECIAL',
        image: '/images/time_bomb.png',
        desc: '【ドロー時】即時発動(+1000点)。8ターン後に爆発(-6000点/手札防御全破棄/選択不可2T)。自ターン開始毎+1000点。±3000点差の相手に50%で受け渡し可能。無敵・ステロイドで消滅。'
    },
    {
        id: 'omamori_koban',
        name: 'お守り小判',
        category: 'SPECIAL',
        image: '/images/omamori_koban.png',
        desc: '【使用時】自分の得点を+3000点する。\n【所有時】自分が「ダイヤの剣」の対象となった時、手札のこのカードを自動で消費して「ダイヤの剣」の効果を無効化し、さらに自分の得点を+3000点する。'
    },
    {
        id: 'omamori_koban_set',
        name: 'お守り小判セット',
        category: 'SPECIAL',
        image: '/images/omamori_koban_set.png',
        desc: '【使用時】自分の得点を+2000点する。\n【所有時】自分が「ダイヤの剣」の対象となった時、自動で1回分消費し、「ダイヤの剣」を回避した上で自分の得点を+2000点する。\n【残り回数】3回'
    },
    {
        id: 'omamori_oban',
        name: 'お守り大判',
        category: 'SPECIAL',
        image: '/images/omamori_oban.png',
        desc: '【使用時】自分の得点を+3000点〜+8000点の範囲で選択して加算する。\n【制限】このターン中、手札から他のカードを使用できない。\n【所有時】自分が「ダイヤの剣」の対象となった時、手札のこのカードを自動で消費し、「ダイヤの剣」を回避した上で自分の得点を+8000点する。'
    },
    {
        id: 'disaster',
        name: '大災害',
        category: 'ATTACK',
        image: '/images/disaster.png',
        desc: '使用者以外全員対象(命中100%)。手札/防御カード全破棄。1位:-6000/2位:-4000/3位:-2000/4位:-1000。ダメージ対象は選択不可(1巡分)付与。'
    },
    {
        id: 'invincible_armor',
        name: '無敵アーマー',
        category: 'SPECIAL',
        image: '/images/invincible_armor.png',
        desc: '特殊カード: 使用から合計4ターン経過まで「無敵状態」になる。防御カードセット時は使用不可。使用時手札から破棄。'
    },
    {
        id: 'dark_matter',
        name: 'ダークマター',
        category: 'SPECIAL',
        image: '/images/dark_matter.png',
        desc: '特殊: 次の自分ターンまで無敵状態付与＆+5000点。使用前と同点、または使用後に追いついた/逆転した相手(無敵・選択不可除く)の手札・防御カード全破棄＆-3000点＆選択不可(2ターン)付与。'
    },
    {
        id: 'steroid',
        name: 'ステロイド',
        category: 'SPECIAL',
        image: '/images/steroid.png',
        desc: '特殊: 使用から4ターン「ステロイド状態」になる。解除時に+1000点。解除時に自分と同点、または追いついた/逆転した相手(無敵・ステロイド・選択不可除く)に50%で手札・防御全破棄＆-3000点＆選択不可付与。'
    },
    {
        id: 'smoke_screen',
        name: '煙幕',
        category: 'ATTACK',
        image: '/images/smoke_screen.png',
        desc: '自分以上の得点を持つ相手全員に-1000点＆暗闇状態(対象が1位なら2T/それ以外1T)を付与。該当者がいない場合は自身に効果発動。'
    }
];

let cardSettings = {
    omamori_koban: true,
    omamori_koban_set: true,
    omamori_oban: true,
    wood_sword: true,
    wood_sword_set: true,
    shotgun: true,
    grenade: true,
    diamond_sword: true,
    earthquake: true,
    time_bomb: true,
    wood_shield: true,
    wood_shield_set: true,
    bronze_shield: true,
    disaster: true,
    invincible_armor: true,
    dark_matter: true,
    steroid: true,
    smoke_screen: true
};

function createInitialState() {
    return {
        started: false,
        players: {},
        turnOrder: [],
        currentTurnPlayerId: null,
        actedPlayerIds: [],
        round: 1,
        turnPhase: 'WAITING',
        draft: {
            phase: 'SELECTING',
            choices: {},
            availableScores: [5000, 1000, -1000, -5000],
            timer: null
        }
    };
}

let gameState = createInitialState();

function resetScoreChanges() {
    Object.values(gameState.players).forEach(p => {
        p.scoreChange = 0;
    });
}

function applyScoreChange(player, amount) {
    player.prevScore = player.score;
    player.scoreChange = amount;
    player.score += amount;
}

function getRandomAvailableCard(player) {
    let availableCards = CARD_DECK.filter(c => cardSettings[c.id] !== false);

    if (player) {
        const hasShieldSetInHand = player.hand && player.hand.some(c => c.id === 'wood_shield_set');
        const hasShieldSetInDefense = player.defenseCard && player.defenseCard.card && player.defenseCard.card.id === 'wood_shield_set';
        if (hasShieldSetInHand || hasShieldSetInDefense) {
            availableCards = availableCards.filter(c => c.id !== 'wood_shield_set');
        }

        const hasSwordSetInHand = player.hand && player.hand.some(c => c.id === 'wood_sword_set');
        const hasSwordSetInDefense = player.defenseCard && player.defenseCard.card && player.defenseCard.card.id === 'wood_sword_set';
        if (hasSwordSetInHand || hasSwordSetInDefense) {
            availableCards = availableCards.filter(c => c.id !== 'wood_sword_set');
        }
    }

    const pool = availableCards.length > 0 ? availableCards : CARD_DECK;
    const template = pool[Math.floor(Math.random() * pool.length)];
    const instance = {
        ...template,
        instanceId: 'card_' + Date.now() + '_' + Math.floor(Math.random() * 1000)
    };

    if (instance.id === 'wood_shield_set' || instance.id === 'wood_sword_set' || instance.id === 'omamori_koban_set') {
        instance.usesLeft = 3;
    }

    return instance;
}

function getSyncPayload(customLog = '') {
    return {
        players: gameState.players,
        turnOrder: gameState.turnOrder,
        currentTurnPlayerId: gameState.currentTurnPlayerId,
        actedPlayerIds: gameState.actedPlayerIds,
        round: gameState.round,
        turnPhase: gameState.turnPhase,
        log: customLog
    };
}

function broadcastGameState(customLog = '') {
    io.emit('syncGameState', getSyncPayload(customLog));
}

function skipDraftAndStartGame() {
    const playerIds = Object.keys(gameState.players);

    playerIds.forEach((id) => {
        const p = gameState.players[id];
        p.score = 25000;
        p.prevScore = 25000;
        p.scoreChange = 0;
        p.draftResolved = true;
    });

    gameState.started = true;
    gameState.draft.phase = 'FINISHED';
    gameState.round = 1;
    gameState.actedPlayerIds = [];

    gameState.currentTurnPlayerId = getNextPlayerId();
    gameState.turnPhase = 'BONUS_CHOICE';

    broadcastGameState('ゲームを開始します。');
}

function resolveDraft() {
    const unresolvedIds = Object.keys(gameState.players).filter(id => !gameState.players[id].draftResolved);
    const chosenMap = {};
    const conflicts = {};

    unresolvedIds.forEach(id => {
        const val = gameState.draft.choices[id];
        if (!chosenMap[val]) chosenMap[val] = [];
        chosenMap[val].push(id);
    });

    Object.keys(chosenMap).forEach(score => {
        if (chosenMap[score].length > 1) {
            conflicts[score] = chosenMap[score];
        }
    });

    if (Object.keys(conflicts).length > 0) {
        Object.keys(chosenMap).forEach(score => {
            if (chosenMap[score].length === 1) {
                const winnerId = chosenMap[score][0];
                const p = gameState.players[winnerId];
                p.score += Number(score);
                p.prevScore = p.score;
                p.draftResolved = true;

                const idx = gameState.draft.availableScores.indexOf(Number(score));
                if (idx !== -1) gameState.draft.availableScores.splice(idx, 1);
            }
        });

        const newUnresolved = Object.keys(gameState.players).filter(id => !gameState.players[id].draftResolved);
        io.emit('draftConflict', {
            unresolvedIds: newUnresolved,
            availableScores: gameState.draft.availableScores,
            players: gameState.players
        });
    } else {
        unresolvedIds.forEach(id => {
            const score = gameState.draft.choices[id];
            const p = gameState.players[id];
            p.score += Number(score);
            p.prevScore = p.score;
            p.draftResolved = true;
        });

        gameState.started = true;
        gameState.draft.phase = 'FINISHED';

        const playerIds = Object.keys(gameState.players);
        for (let i = playerIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
        }

        gameState.turnOrder = playerIds;
        gameState.currentTurnPlayerId = playerIds[0];
        gameState.actedPlayerIds = [];
        gameState.round = 1;
        gameState.turnPhase = 'BONUS_CHOICE';

        broadcastGameState('ドラフト完了！ゲームを開始します。');
    }
}

/**
 * 次の行動プレイヤーを決定するロジック
 */
function getNextPlayerId() {
    const allPlayers = Object.values(gameState.players);

    const unactedPlayers = allPlayers.filter(p => !gameState.actedPlayerIds.includes(p.id));
    if (unactedPlayers.length === 0) return null;

    if (gameState.round === 1) {
        const firstScore = allPlayers[0].score;
        const isAllEqualScore = allPlayers.every(p => p.score === firstScore);

        if (isAllEqualScore) {
            const sortedByNumber = [...unactedPlayers].sort((a, b) => a.number - b.number);
            return sortedByNumber[0].id;
        }
    }

    unactedPlayers.sort((a, b) => b.score - a.score);
    const highestScore = unactedPlayers[0].score;
    const topCandidates = unactedPlayers.filter(p => p.score === highestScore);

    if (topCandidates.length === 1) {
        return topCandidates[0].id;
    } else {
        const randomIndex = Math.floor(Math.random() * topCandidates.length);
        return topCandidates[randomIndex].id;
    }
}

/**
 * 1巡目の共通ルール（カード非依存）
 */
function isLaterPlayerInRound1(actorId, targetId) {
    if (gameState.round !== 1) return false;
    if (!targetId || targetId === actorId) return false;
    if (targetId === gameState.currentTurnPlayerId) return false;
    return !gameState.actedPlayerIds.includes(targetId);
}

function cannotSelectAsAttackTargetInRound1(attackerId, targetId) {
    return isLaterPlayerInRound1(attackerId, targetId);
}

function isImmuneToRound1CardEffect(targetId, casterId) {
    return isLaterPlayerInRound1(casterId, targetId);
}

const ROUND1_TARGET_ERROR = '1巡目は自分より後に行動するプレイヤーを攻撃対象に選択できません。';

function emitIfCannotSelectRound1Target(socket, attackerId, targetPlayerId) {
    if (!cannotSelectAsAttackTargetInRound1(attackerId, targetPlayerId)) return false;
    socket.emit('errorMessage', ROUND1_TARGET_ERROR);
    return true;
}

function skipIfImmuneToRound1CardEffect(target, caster, cardLabel) {
    if (!target || !caster) return false;
    if (!isImmuneToRound1CardEffect(target.id, caster.id)) return false;
    broadcastGameState(`P${caster.number} の${cardLabel} (対象: P${target.number})！ P${target.number} は1巡目のため、先行プレイヤーのカード効果を受けません。`);
    return true;
}

function isDefenseBlocked(target, attacker) {
    if (!target.defenseCard) return false;
    const isRestricted = ['wood_sword', 'wood_sword_set', 'grenade'].includes(target.defenseCard.card.id);
    return isRestricted && (attacker.score > target.score);
}

function executeGrenadeDefenseCounter(defenderId) {
    const defender = gameState.players[defenderId];
    if (!defender) return;

    const myScore = defender.score;
    const allPlayers = Object.values(gameState.players);

    const targets = allPlayers.filter(p => p.id !== defenderId && p.score <= myScore && (myScore - p.score) <= 1000);
    if (targets.length === 0) return;

    const counterLogs = [];

    targets.forEach(target => {
        const isInvincible = target.invincibleTurns && target.invincibleTurns > 0;
        const isSteroid = target.steroidTurns && target.steroidTurns > 0;
        const isImmune = target.immunityCount && target.immunityCount > 0;

        if (isInvincible || isSteroid || isImmune) {
            if (isInvincible && target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            if (isSteroid) target.steroidRevealed = true;

            let defMsg = '';
            if (target.defenseCard) {
                target.defenseCard = null;
                defMsg = '防御カード破棄';
            }
            const stateName = isInvincible ? '無敵' : (isSteroid ? 'ステロイド' : '選択不可');
            counterLogs.push(`P${target.number}(${stateName}ガード${defMsg ? '・' + defMsg : ''})`);
        } else {
            target.hand = [];
            target.defenseCard = null;
            applyScoreChange(target, -5000);
            target.immunityCount = 2;
            counterLogs.push(`P${target.number}(-5000点・手札防御全破棄・選択不可2T)`);
        }
    });

    broadcastGameState(`💥 P${defender.number} の「グレネード」カウンター発動！ 反撃対象: ${counterLogs.join(' / ')}`);
}

function executeGrenadeSplash(primaryTargetId, casterId) {
    const primaryTarget = gameState.players[primaryTargetId];
    const caster = gameState.players[casterId];
    if (!primaryTarget || !caster) return;

    const centerScore = primaryTarget.score;
    const allPlayers = Object.values(gameState.players);

    const victims = allPlayers.filter(p => Math.abs(p.score - centerScore) <= 1000);
    const affectedLogs = [];

    victims.forEach(victim => {
        if (victim.id !== casterId && isImmuneToRound1CardEffect(victim.id, casterId)) {
            affectedLogs.push(`P${victim.number}(1巡目効果無効)`);
            return;
        }

        const isInvincible = victim.invincibleTurns && victim.invincibleTurns > 0;
        const isSteroid = victim.steroidTurns && victim.steroidTurns > 0;
        const isImmune = victim.immunityCount && victim.immunityCount > 0;

        if (isInvincible || isSteroid || isImmune) {
            if (isInvincible && victim.invincibleSource === 'ARMOR') victim.armorRevealed = true;
            if (isSteroid) victim.steroidRevealed = true;

            let defMsg = '';
            if (victim.defenseCard) {
                victim.defenseCard = null;
                defMsg = '防御カード破棄';
            }
            const stateName = isInvincible ? '無敵' : (isSteroid ? 'ステロイド' : '選択不可');
            affectedLogs.push(`P${victim.number}(${stateName}ガード${defMsg ? '・' + defMsg : ''})`);
        } else {
            victim.hand = [];
            victim.defenseCard = null;
            applyScoreChange(victim, -5000);
            victim.immunityCount = 2;
            affectedLogs.push(`P${victim.number}(-5000点・手札防御全破棄・選択不可2T)`);
        }
    });

    broadcastGameState(`💥 グレネード爆発！ 誘爆対象: ${affectedLogs.join(' / ')}`);
}

function handleBuffExpire(player, buffType) {
    const cardName = buffType === 'ARMOR' ? '無敵アーマー' : 'ステロイド';
    const prevMyScore = player.score;

    if (buffType === 'ARMOR') {
        player.armorRevealed = false;
    } else {
        player.steroidRevealed = false;
    }

    applyScoreChange(player, 1000);
    const newMyScore = player.score;

    const penalizedNames = [];

    Object.values(gameState.players).forEach(opponent => {
        if (opponent.id === player.id) return;
        if (isImmuneToRound1CardEffect(opponent.id, player.id)) return;

        const isInvincible = opponent.invincibleTurns && opponent.invincibleTurns > 0;
        const isImmune = opponent.immunityCount && opponent.immunityCount > 0;
        const isSteroid = opponent.steroidTurns && opponent.steroidTurns > 0;

        if (isInvincible || isImmune) return;
        if (buffType === 'STERIOD' && isSteroid) return;

        const isConditionA = (opponent.score === prevMyScore);
        const isConditionB = (opponent.score > prevMyScore && newMyScore >= opponent.score);

        if (isConditionA || isConditionB) {
            const isSuccess = Math.random() < 0.5;

            if (isSuccess) {
                opponent.hand = [];
                opponent.defenseCard = null;
                applyScoreChange(opponent, -3000);
                opponent.immunityCount = 2;

                penalizedNames.push(`P${opponent.number}(成功)`);
            } else {
                penalizedNames.push(`P${opponent.number}(不発)`);
            }
        }
    });

    let logMsg = `P${player.number} の「${cardName}」が解除され、+1000点獲得！`;
    if (penalizedNames.length > 0) {
        logMsg += ` ペナルティ結果: ${penalizedNames.join(', ')}`;
    }

    return logMsg;
}

function proceedToNextTurn() {
    resetScoreChanges();

    const currId = gameState.currentTurnPlayerId;
    const currPlayer = currId ? gameState.players[currId] : null;

    if (currId && !gameState.actedPlayerIds.includes(currId)) {
        gameState.actedPlayerIds.push(currId);
    }

    if (currPlayer && currPlayer.darknessTurns > 0) {
        currPlayer.darknessTurns -= 1;
    }

    Object.values(gameState.players).forEach(p => {
        if (currId && p.id !== currId && p.immunityCount > 0) {
            p.immunityCount -= 1;
        }
    });

    const expireLogs = [];
    Object.values(gameState.players).forEach(p => {
        if (p.invincibleTurns > 0 && p.invincibleSource === 'ARMOR') {
            p.invincibleTurns -= 1;
            if (p.invincibleTurns === 0) {
                p.invincibleSource = null;
                p.armorRevealed = false;
                const msg = handleBuffExpire(p, 'ARMOR');
                if (msg) expireLogs.push(msg);
            }
        }
        if (p.steroidTurns > 0) {
            p.steroidTurns -= 1;
            if (p.steroidTurns === 0) {
                p.steroidRevealed = false;
                const msg = handleBuffExpire(p, 'STERIOD');
                if (msg) expireLogs.push(msg);
            }
        }
        if (p.timeBombTurns > 0) {
            if (p.invincibleTurns > 0 || p.steroidTurns > 0) {
                p.timeBombTurns = 0;
            } else {
                p.timeBombTurns -= 1;
                if (p.timeBombTurns === 0) {
                    applyScoreChange(p, -6000);
                    p.hand = [];
                    p.defenseCard = null;
                    p.immunityCount = 2;
                    expireLogs.push(`💣 P${p.number} の「時限爆弾」が爆発！ -6000点、手札・防御全破棄、選択不可(2T)付与！`);
                }
            }
        }
    });

    if (gameState.actedPlayerIds.length >= Object.keys(gameState.players).length) {
        gameState.round += 1;
        gameState.actedPlayerIds = [];

        if (gameState.round > 10) {
            broadcastGameState('全10巡が終了しました！ゲーム終了！');
            return;
        }
    }

    const nextPlayerId = getNextPlayerId();
    gameState.currentTurnPlayerId = nextPlayerId;
    gameState.turnPhase = 'BONUS_CHOICE';

    if (nextPlayerId) {
        const nextPlayer = gameState.players[nextPlayerId];
        nextPlayer.bombTransferAttempted = false;
        nextPlayer.bombDrawnThisTurn = false;
        nextPlayer.playedHandCardThisTurn = false;
        nextPlayer.playedObanThisTurn = false;

        if (nextPlayer.invincibleTurns > 0 && nextPlayer.invincibleSource === 'DARK_MATTER') {
            nextPlayer.invincibleTurns = 0;
            nextPlayer.invincibleSource = null;
        }

        if (nextPlayer.timeBombTurns > 0) {
            if (nextPlayer.invincibleTurns > 0 || nextPlayer.steroidTurns > 0) {
                nextPlayer.timeBombTurns = 0;
            } else if (!nextPlayer.bombDrawnThisTurn) {
                applyScoreChange(nextPlayer, 1000);
                expireLogs.push(`P${nextPlayer.number} の「時限爆弾」保持ボーナス: +1000点獲得！`);
            }
        }
    }

    let finalLog = expireLogs.length > 0 ? expireLogs.join('\n') + '\n' : '';
    finalLog += `P${gameState.players[gameState.currentTurnPlayerId].number} のターンになりました。`;
    broadcastGameState(finalLog);
}

let skipBonusModal = true;

io.on('connection', (socket) => {
    console.log('接続:', socket.id);
    const playerKeys = Object.keys(gameState.players);

    if (playerKeys.length < 4 && !gameState.started) {
        const pNum = playerKeys.length + 1;
        gameState.players[socket.id] = {
            id: socket.id,
            number: pNum,
            name: `P${pNum}`,
            score: 25000,
            prevScore: 25000,
            scoreChange: 0,
            hand: [],
            defenseCard: null,
            draftResolved: false,
            immunityCount: 0,
            invincibleTurns: 0,
            invincibleSource: null,
            armorRevealed: false,
            steroidTurns: 0,
            steroidRevealed: false,
            darknessTurns: 0,
            timeBombTurns: 0,
            bombTransferAttempted: false,
            bombDrawnThisTurn: false,
            playedHandCardThisTurn: false,
            playedObanThisTurn: false
        };

        socket.emit('init', { playerNumber: pNum, id: socket.id });
        io.emit('playerUpdate', { playerCount: Object.keys(gameState.players).length });
        socket.emit('updateCardSettings', cardSettings);

        if (Object.keys(gameState.players).length === 4) {
            skipDraftAndStartGame();
        }
    } else {
        socket.emit('full');
    }

    socket.on('debugUpdateScore', ({ targetPlayerId, amount, setDirect }) => {
        const target = gameState.players[targetPlayerId];
        if (!target) return;

        resetScoreChanges();
        target.prevScore = target.score;

        if (setDirect) {
            const newScore = Number(amount);
            target.scoreChange = newScore - target.score;
            target.score = newScore;
        } else {
            target.scoreChange = Number(amount);
            target.score += Number(amount);
        }

        broadcastGameState(`[デバッグ] P${target.number} の得点が ${target.score} 点に変更されました。`);
    });

    socket.on('debugDrawCard', ({ targetPlayerId }) => {
        const target = gameState.players[targetPlayerId];
        if (!target) return;

        resetScoreChanges();

        const randomCard = getRandomAvailableCard(target);

        if (randomCard.id === 'time_bomb') {
            applyScoreChange(target, 1000);
            target.timeBombTurns = 8;
            target.bombDrawnThisTurn = true;

            if (target.invincibleTurns > 0 || target.steroidTurns > 0) {
                target.timeBombTurns = 0;
                broadcastGameState(`[デバッグ] P${target.number} が「時限爆弾」をドローしましたが、無敵/ステロイド状態のため消滅しました！`);
            } else {
                io.emit('showCutIn', { title: '時限爆弾出現！', imagePath: '/images/time_bomb.png' });
                broadcastGameState(`[デバッグ] P${target.number} が「時限爆弾」をドロー！ +1000点獲得＆時限爆弾状態(8T)付与！`);
            }
        } else {
            target.hand.push(randomCard);
            broadcastGameState(`[デバッグ] P${target.number} が山札から「${randomCard.name}」をドローしました。`);
        }
    });

    socket.on('toggleCardSetting', ({ cardId, enabled }) => {
        if (cardSettings.hasOwnProperty(cardId)) {
            cardSettings[cardId] = enabled;
            io.emit('updateCardSettings', cardSettings);
        }
    });

    socket.on('selectDraftScore', (score) => {
        if (gameState.started || gameState.draft.phase === 'FINISHED') return;
        const player = gameState.players[socket.id];
        if (!player || player.draftResolved) return;

        gameState.draft.choices[socket.id] = Number(score);
        const unresolvedIds = Object.keys(gameState.players).filter(id => !gameState.players[id].draftResolved);
        const answeredCount = unresolvedIds.filter(id => gameState.draft.choices[id] !== undefined).length;

        if (answeredCount >= unresolvedIds.length) {
            if (gameState.draft.timer) clearTimeout(gameState.draft.timer);
            resolveDraft();
        }
    });

    socket.emit('updateBonusSkipSetting', skipBonusModal);

    socket.on('toggleBonusSkipSetting', (enabled) => {
        skipBonusModal = enabled;
        io.emit('updateBonusSkipSetting', skipBonusModal);
    });

    socket.on('chooseBonus', (acceptBonus) => {
        resetScoreChanges();
        const currentTurnId = gameState.currentTurnPlayerId;
        if (socket.id !== currentTurnId || gameState.turnPhase !== 'BONUS_CHOICE') return;

        const player = gameState.players[socket.id];
        if (acceptBonus) applyScoreChange(player, 3000);

        const randomCard = getRandomAvailableCard(player);
        gameState.turnPhase = 'MAIN';

        if (randomCard.id === 'time_bomb') {
            applyScoreChange(player, 1000);
            player.timeBombTurns = 8;
            player.bombDrawnThisTurn = true;

            const bonusLog = acceptBonus ? ' (+3000点獲得)' : '';

            if (player.invincibleTurns > 0 || player.steroidTurns > 0) {
                player.timeBombTurns = 0;
                broadcastGameState(`P${player.number} が「時限爆弾」をドローしましたが、無敵/ステロイド状態のため消滅しました！${bonusLog}`);
            } else {
                io.emit('showCutIn', { title: '時限爆弾出現！', imagePath: '/images/time_bomb.png' });
                broadcastGameState(`P${player.number} が「時限爆弾」をドロー！ +1000点獲得＆時限爆弾状態(8T)付与！${bonusLog}`);
            }
        } else {
            player.hand.push(randomCard);
            const bonusLog = acceptBonus ? ' (+3000点獲得)' : '';
            socket.emit('syncGameState', getSyncPayload(`「${randomCard.name}」を獲得しました。${bonusLog}`));
            socket.broadcast.emit('syncGameState', getSyncPayload(`P${player.number} がカードを1枚獲得しました。${bonusLog}`));
        }
    });

    socket.on('transferTimeBomb', ({ targetPlayerId }) => {
        const currentTurnId = gameState.currentTurnPlayerId;
        if (socket.id !== currentTurnId || gameState.turnPhase !== 'MAIN') return;

        const player = gameState.players[socket.id];
        const target = gameState.players[targetPlayerId];

        if (!player || !target || player.timeBombTurns <= 0 || player.bombTransferAttempted) {
            socket.emit('errorMessage', '受け渡し条件を満たしていません。');
            return;
        }

        const diff = Math.abs(player.score - target.score);
        const isTargetProtected = (target.invincibleTurns > 0) || (target.steroidTurns > 0);

        if (diff > 3000 || isTargetProtected) {
            socket.emit('errorMessage', 'この相手には受け渡しできません。');
            return;
        }

        player.bombTransferAttempted = true;
        const isSuccess = Math.random() < 0.5;

        if (isSuccess) {
            target.timeBombTurns = player.timeBombTurns;
            player.timeBombTurns = 0;
            broadcastGameState(`P${player.number} が P${target.number} へ「時限爆弾」の受け渡しに成功しました！ (残り${target.timeBombTurns}T)`);
            socket.emit('transferTimeBombResult', { success: true });
        } else {
            broadcastGameState(`P${player.number} の「時限爆弾」受け渡しは失敗しました… (不発)`);
            socket.emit('transferTimeBombResult', { success: false });
        }
    });

    socket.on('playCard', ({ instanceId, actionTarget, targetPlayerId, attackCount, chosenScore }) => {
        resetScoreChanges();

        const currentTurnId = gameState.currentTurnPlayerId;
        if (socket.id !== currentTurnId || gameState.turnPhase !== 'MAIN') {
            socket.emit('errorMessage', 'あなたのターンのメインフェーズではありません。');
            return;
        }

        const player = gameState.players[socket.id];
        const cardIndex = player.hand.findIndex(c => String(c.instanceId) === String(instanceId));
        if (cardIndex === -1) {
            socket.emit('errorMessage', 'エラー: カードが見つかりません。');
            return;
        }

        const card = player.hand[cardIndex];

        if (player.defenseCard && !card.allowWithDefense) {
            socket.emit('errorMessage', '防御カードがセットされています。');
            return;
        }

        // お守り大判の排他制御チェック
        if (card.id === 'omamori_oban') {
            if (player.playedHandCardThisTurn && !player.playedObanThisTurn) {
                socket.emit('errorMessage', '他のカードを使用したため発動できません。');
                return;
            }
        } else {
            if (player.playedObanThisTurn) {
                socket.emit('errorMessage', '「お守り大判」を使用したため発動できません。');
                return;
            }
        }

        if (card.id === 'omamori_oban') {
            const addPoints = Math.min(Math.max(Number(chosenScore) || 8000, 3000), 8000);
            applyScoreChange(player, addPoints);
            player.playedHandCardThisTurn = true;
            player.playedObanThisTurn = true;
            player.hand.splice(cardIndex, 1);
            broadcastGameState(`P${player.number} が「お守り大判」を使用し、+${addPoints}点獲得しました！`);
            return;
        }

        player.playedHandCardThisTurn = true;

        if (card.id === 'omamori_koban') {
            applyScoreChange(player, 3000);
            player.hand.splice(cardIndex, 1);
            broadcastGameState(`P${player.number} が「お守り小判」を使用し、+3000点獲得しました！`);
        } else if (card.id === 'omamori_koban_set') {
            if (!card.usesLeft) card.usesLeft = 3;
            const count = Math.min(Math.max(Number(attackCount) || 1, 1), card.usesLeft);
            const addPoints = count * 2000;
            card.usesLeft -= count;
            applyScoreChange(player, addPoints);

            let msg = `P${player.number} が「お守り小判セット」を${count}回分使用し、+${addPoints}点獲得しました！`;
            if (card.usesLeft <= 0) {
                player.hand.splice(cardIndex, 1);
                msg += '（カード破棄）';
            }
            broadcastGameState(msg);
        } else if (card.id === 'disaster') {
            player.hand.splice(cardIndex, 1);
            executeDisasterAttack(socket.id);
        } else if (card.id === 'diamond_sword') {
            player.hand.splice(cardIndex, 1);
            executeDiamondSword(socket.id);
        } else if (card.id === 'earthquake') {
            player.hand.splice(cardIndex, 1);
            executeEarthquake(socket.id);
        } else if (card.id === 'invincible_armor') {
            player.invincibleTurns = 4;
            player.invincibleSource = 'ARMOR';
            player.armorRevealed = false;
            if (player.timeBombTurns > 0) player.timeBombTurns = 0;
            player.hand.splice(cardIndex, 1);

            socket.emit('syncGameState', getSyncPayload(`「無敵アーマー」を使用しました。4ターンの間「無敵状態」になります。`));
            socket.broadcast.emit('syncGameState', getSyncPayload(''));
        } else if (card.id === 'dark_matter') {
            player.hand.splice(cardIndex, 1);
            if (player.timeBombTurns > 0) player.timeBombTurns = 0;
            executeDarkMatter(socket.id);
        } else if (card.id === 'steroid') {
            player.steroidTurns = 4;
            player.steroidRevealed = false;
            if (player.timeBombTurns > 0) player.timeBombTurns = 0;
            player.hand.splice(cardIndex, 1);

            socket.emit('syncGameState', getSyncPayload(`「ステロイド」を使用しました。4ターンの間「ステロイド状態」になります。`));
            socket.broadcast.emit('syncGameState', getSyncPayload(''));
        } else if (card.id === 'smoke_screen') {
            player.hand.splice(cardIndex, 1);
            executeSmokeScreen(socket.id);
        } else if (actionTarget === 'ATTACK') {
            if (!targetPlayerId) {
                socket.emit('errorMessage', '攻撃対象を選択してください。');
                return;
            }

            if (card.id === 'wood_shield' && (targetPlayerId === 'EQUAL_OR_HIGHER' || targetPlayerId === 'LOWER')) {
                player.hand.splice(cardIndex, 1);
                executeWoodShieldGroupAttack(socket.id, targetPlayerId);
            } else if (card.id === 'bronze_shield') {
                player.hand.splice(cardIndex, 1);
                if (targetPlayerId === 'CLOSEST_HIGHER') {
                    executeBronzeShieldClosestAttack(socket.id);
                } else if (targetPlayerId === 'LOWER') {
                    executeBronzeShieldGroupAttack(socket.id);
                }
            } else if (card.id === 'grenade') {
                player.hand.splice(cardIndex, 1);
                if (targetPlayerId === 'ALL_LOWER') {
                    executeGrenadeGroupAttack(socket.id);
                } else {
                    executeGrenadeSingleAttack(socket.id, targetPlayerId);
                }
            } else if (card.id === 'wood_shield_set' && (targetPlayerId === 'EQUAL_OR_HIGHER' || targetPlayerId === 'LOWER')) {
                let cardObj = player.hand[cardIndex];
                if (!cardObj.usesLeft) cardObj.usesLeft = 3;
                const requestedCount = Math.min(Math.max(Number(attackCount) || 1, 1), 3);
                const maxAttacks = Math.min(requestedCount, cardObj.usesLeft);

                executeShieldSetGroupAttack(socket.id, targetPlayerId, cardObj, maxAttacks, () => {
                    if (cardObj.usesLeft <= 0) {
                        const idx = player.hand.findIndex(c => String(c.instanceId) === String(cardObj.instanceId));
                        if (idx !== -1) {
                            player.hand.splice(idx, 1);
                        }
                    }
                    broadcastGameState();
                });
            } else if (card.id === 'wood_sword_set') {
                let cardObj = player.hand[cardIndex];
                if (!cardObj.usesLeft) cardObj.usesLeft = 3;
                const requestedCount = Math.min(Math.max(Number(attackCount) || 1, 1), 3);
                const maxAttacks = Math.min(requestedCount, cardObj.usesLeft);

                if (targetPlayerId === 'ALL_LOWER') {
                    executeWoodSwordSetGroupAttack(socket.id, cardObj, maxAttacks, () => {
                        if (cardObj.usesLeft <= 0) {
                            const idx = player.hand.findIndex(c => String(c.instanceId) === String(cardObj.instanceId));
                            if (idx !== -1) {
                                player.hand.splice(idx, 1);
                            }
                        }
                        broadcastGameState();
                    });
                } else {
                    const target = gameState.players[targetPlayerId];
                    if (!target) {
                        socket.emit('errorMessage', '対象となるプレイヤーが見つかりません。');
                        return;
                    }
                    if (target.immunityCount && target.immunityCount > 0) {
                        socket.emit('errorMessage', `${target.name} は現在「選択不可状態」のため攻撃できません。`);
                        return;
                    }
                    if (emitIfCannotSelectRound1Target(socket, socket.id, targetPlayerId)) return;

                    executeWoodSwordSetAttack(socket.id, targetPlayerId, cardObj, maxAttacks, () => {
                        if (cardObj.usesLeft <= 0) {
                            const idx = player.hand.findIndex(c => String(c.instanceId) === String(cardObj.instanceId));
                            if (idx !== -1) {
                                player.hand.splice(idx, 1);
                            }
                        }
                        broadcastGameState();
                    });
                }
            } else if (card.id === 'wood_sword') {
                if (targetPlayerId === 'ALL_LOWER') {
                    player.hand.splice(cardIndex, 1);
                    executeWoodSwordAttack(socket.id, targetPlayerId);
                } else {
                    const target = gameState.players[targetPlayerId];
                    if (!target) {
                        socket.emit('errorMessage', '対象となるプレイヤーが見つかりません。');
                        return;
                    }
                    if (target.immunityCount && target.immunityCount > 0) {
                        socket.emit('errorMessage', `${target.name} は現在「選択不可状態」のため攻撃できません。`);
                        return;
                    }
                    if (emitIfCannotSelectRound1Target(socket, socket.id, targetPlayerId)) return;

                    player.hand.splice(cardIndex, 1);
                    executeWoodSwordAttack(socket.id, targetPlayerId);
                }
            } else if (card.id === 'shotgun') {
                player.hand.splice(cardIndex, 1);
                executeShotgunAttack(socket.id, targetPlayerId);
            } else {
                const target = gameState.players[targetPlayerId];
                if (!target) {
                    socket.emit('errorMessage', '対象となるプレイヤーが見つかりません。');
                    return;
                }

                if (target.immunityCount && target.immunityCount > 0) {
                    socket.emit('errorMessage', `${target.name} は現在「選択不可状態」のため攻撃できません。`);
                    return;
                }

                if (emitIfCannotSelectRound1Target(socket, socket.id, targetPlayerId)) return;

                if (card.id === 'wood_shield_set') {
                    let cardObj = player.hand[cardIndex];
                    if (!cardObj.usesLeft) cardObj.usesLeft = 3;

                    const requestedCount = Math.min(Math.max(Number(attackCount) || 1, 1), 3);
                    const actualAttacks = Math.min(requestedCount, cardObj.usesLeft);

                    executeShieldSetAttack(socket.id, targetPlayerId, cardObj, actualAttacks, () => {
                        if (cardObj.usesLeft <= 0) {
                            const idx = player.hand.findIndex(c => String(c.instanceId) === String(cardObj.instanceId));
                            if (idx !== -1) {
                                player.hand.splice(idx, 1);
                            }
                        }
                        broadcastGameState();
                    });
                } else {
                    player.hand.splice(cardIndex, 1);
                    executeStandardAttack(socket.id, targetPlayerId, card.id);
                }
            }
        } else if (actionTarget === 'DEFENSE') {
            if (player.defenseCard) {
                socket.emit('errorMessage', '防御カードはすでにセットされています。');
                return;
            }

            let uses = 1;
            if (card.id === 'wood_shield_set' || card.id === 'wood_sword_set') {
                if (!card.usesLeft) card.usesLeft = 3;
                uses = card.usesLeft;
            }

            player.defenseCard = { card, usesLeft: uses };
            player.hand.splice(cardIndex, 1);
            broadcastGameState(`P${player.number} が防御カード「${card.name}」をセットしました。`);
        }
    });

    socket.on('playDefenseAsAttack', ({ targetPlayerId, attackCount }) => {
        resetScoreChanges();
        const currentTurnId = gameState.currentTurnPlayerId;
        if (socket.id !== currentTurnId || gameState.turnPhase !== 'MAIN') {
            socket.emit('errorMessage', 'メインフェーズでのみ使用できます。');
            return;
        }

        const player = gameState.players[socket.id];
        if (!player.defenseCard) {
            socket.emit('errorMessage', 'セットされている防御カードがありません。');
            return;
        }

        const defObj = player.defenseCard;
        const card = defObj.card;

        if (card.id === 'wood_shield' && (targetPlayerId === 'EQUAL_OR_HIGHER' || targetPlayerId === 'LOWER')) {
            player.defenseCard = null;
            executeWoodShieldGroupAttack(socket.id, targetPlayerId);
            return;
        }

        if (card.id === 'bronze_shield') {
            player.defenseCard = null;
            if (targetPlayerId === 'CLOSEST_HIGHER') {
                executeBronzeShieldClosestAttack(socket.id);
            } else if (targetPlayerId === 'LOWER') {
                executeBronzeShieldGroupAttack(socket.id);
            }
            return;
        }

        if (card.id === 'grenade') {
            player.defenseCard = null;
            if (targetPlayerId === 'ALL_LOWER') {
                executeGrenadeGroupAttack(socket.id);
            } else {
                executeGrenadeSingleAttack(socket.id, targetPlayerId);
            }
            return;
        }

        if (card.id === 'wood_shield_set' && (targetPlayerId === 'EQUAL_OR_HIGHER' || targetPlayerId === 'LOWER')) {
            const requestedCount = Math.min(Math.max(Number(attackCount) || 1, 1), 3);
            const maxAttacks = Math.min(requestedCount, defObj.usesLeft);

            executeShieldSetGroupAttack(socket.id, targetPlayerId, defObj, maxAttacks, () => {
                card.usesLeft = defObj.usesLeft;
                if (defObj.usesLeft <= 0) {
                    player.defenseCard = null;
                }
                broadcastGameState();
            });
            return;
        }

        if (card.id === 'wood_sword_set') {
            const requestedCount = Math.min(Math.max(Number(attackCount) || 1, 1), 3);
            const maxAttacks = Math.min(requestedCount, defObj.usesLeft);

            if (targetPlayerId === 'ALL_LOWER') {
                executeWoodSwordSetGroupAttack(socket.id, defObj, maxAttacks, () => {
                    card.usesLeft = defObj.usesLeft;
                    if (defObj.usesLeft <= 0) {
                        player.defenseCard = null;
                    }
                    broadcastGameState();
                });
                return;
            } else {
                if (!targetPlayerId || !gameState.players[targetPlayerId] || targetPlayerId === socket.id) {
                    socket.emit('errorMessage', '攻撃対象を選択してください。');
                    return;
                }
                const target = gameState.players[targetPlayerId];
                if (target.immunityCount && target.immunityCount > 0) {
                    socket.emit('errorMessage', `${target.name} は現在「選択不可状態」のため攻撃できません。`);
                    return;
                }
                if (emitIfCannotSelectRound1Target(socket, socket.id, targetPlayerId)) return;

                executeWoodSwordSetAttack(socket.id, targetPlayerId, defObj, maxAttacks, () => {
                    card.usesLeft = defObj.usesLeft;
                    if (defObj.usesLeft <= 0) {
                        player.defenseCard = null;
                    }
                    broadcastGameState();
                });
                return;
            }
        }

        if (card.id === 'wood_sword') {
            if (targetPlayerId === 'ALL_LOWER') {
                player.defenseCard = null;
                executeWoodSwordAttack(socket.id, targetPlayerId);
                return;
            } else {
                if (!targetPlayerId || !gameState.players[targetPlayerId] || targetPlayerId === socket.id) {
                    socket.emit('errorMessage', '攻撃対象を選択してください。');
                    return;
                }
                const target = gameState.players[targetPlayerId];
                if (target.immunityCount && target.immunityCount > 0) {
                    socket.emit('errorMessage', `${target.name} は現在「選択不可状態」のため攻撃できません。`);
                    return;
                }
                if (emitIfCannotSelectRound1Target(socket, socket.id, targetPlayerId)) return;

                player.defenseCard = null;
                executeWoodSwordAttack(socket.id, targetPlayerId);
                return;
            }
        }

        if (!targetPlayerId || !gameState.players[targetPlayerId] || targetPlayerId === socket.id) {
            socket.emit('errorMessage', '攻撃対象を選択してください。');
            return;
        }

        const target = gameState.players[targetPlayerId];
        if (target.immunityCount && target.immunityCount > 0) {
            socket.emit('errorMessage', `${target.name} は現在「選択不可状態」のため攻撃できません。`);
            return;
        }

        if (emitIfCannotSelectRound1Target(socket, socket.id, targetPlayerId)) return;

        if (card.id === 'wood_shield_set') {
            const requestedCount = Math.min(Math.max(Number(attackCount) || 1, 1), 3);
            const actualAttacks = Math.min(requestedCount, defObj.usesLeft);

            executeShieldSetAttack(socket.id, targetPlayerId, defObj, actualAttacks, () => {
                card.usesLeft = defObj.usesLeft;
                if (defObj.usesLeft <= 0) {
                    player.defenseCard = null;
                }
                broadcastGameState();
            });
        } else {
            defObj.usesLeft -= 1;
            if (defObj.usesLeft <= 0) {
                player.defenseCard = null;
            }
            executeStandardAttack(socket.id, targetPlayerId, card.id);
        }
    });

    socket.on('discardDefense', () => {
        const currentTurnId = gameState.currentTurnPlayerId;
        if (socket.id !== currentTurnId || gameState.turnPhase !== 'MAIN') return;
        const player = gameState.players[socket.id];
        if (player.defenseCard) {
            player.defenseCard = null;
            broadcastGameState(`P${player.number} がセット中の防御カードを破棄しました。`);
        }
    });

    socket.on('endTurn', () => {
        resetScoreChanges();
        const currentTurnId = gameState.currentTurnPlayerId;
        if (socket.id !== currentTurnId) return;

        const player = gameState.players[socket.id];
        if (player.hand.length >= 2) {
            gameState.turnPhase = 'DISCARD';
            socket.emit('mustDiscard', { currentCount: player.hand.length });
            broadcastGameState(`P${player.number} は手札削減中...`);
        } else {
            proceedToNextTurn();
        }
    });

    socket.on('discardCard', (instanceId) => {
        const currentTurnId = gameState.currentTurnPlayerId;
        if (socket.id !== currentTurnId || gameState.turnPhase !== 'DISCARD') return;

        const player = gameState.players[socket.id];
        const cardIndex = player.hand.findIndex(c => String(c.instanceId) === String(instanceId));
        if (cardIndex !== -1) {
            const removed = player.hand.splice(cardIndex, 1)[0];
            if (player.hand.length <= 1) {
                gameState.turnPhase = 'MAIN';
                proceedToNextTurn();
            } else {
                socket.emit('mustDiscard', { currentCount: player.hand.length });
                broadcastGameState(`P${player.number} が「${removed.name}」を捨てました。`);
            }
        }
    });

    socket.on('disconnect', () => {
        delete gameState.players[socket.id];
        if (Object.keys(gameState.players).length === 0) {
            if (gameState.draft.timer) clearTimeout(gameState.draft.timer);
            gameState = createInitialState();
            console.log('全員切断のためリセット');
        } else {
            io.emit('playerUpdate', { playerCount: Object.keys(gameState.players).length });
        }
    });
});

function getWoodShieldHitRate(attackerScore, targetScore) {
    const diff = attackerScore - targetScore;
    const rate = Math.max(0, 1 - Math.abs(diff) / 10000);
    return rate;
}

function getBronzeShieldLowerHitRate(attackerScore, targetScore) {
    const diff = attackerScore - targetScore;
    const rate = Math.max(0, 1 - Math.abs(diff) / 5000);
    return rate;
}

function executeEarthquake(casterSocketId) {
    const caster = gameState.players[casterSocketId];
    if (!caster) return;

    io.emit('showCutIn', {
        title: '地震発動！',
        imagePath: '/images/earthquake.png'
    });

    setTimeout(() => {
        const myScore = caster.score;
        const allPlayers = Object.values(gameState.players);

        const targets = allPlayers.filter(p => p.id !== casterSocketId && p.score >= myScore);

        if (targets.length === 0) {
            broadcastGameState(`P${caster.number} が「地震」を発動しましたが、同点以上の相手が存在しないため不発に終わりました。`);
            return;
        }

        const affectedLogs = [];

        targets.forEach(target => {
            if (isImmuneToRound1CardEffect(target.id, casterSocketId)) {
                affectedLogs.push(`P${target.number}(1巡目効果無効)`);
                return;
            }

            const isInvincible = target.invincibleTurns && target.invincibleTurns > 0;
            const isSteroid = target.steroidTurns && target.steroidTurns > 0;

            if (isInvincible || isSteroid) {
                if (isInvincible && target.invincibleSource === 'ARMOR') target.armorRevealed = true;
                if (isSteroid) target.steroidRevealed = true;
                const stateName = isInvincible ? '無敵' : 'ステロイド';
                affectedLogs.push(`P${target.number}(${stateName}ガード)`);
                return;
            }

            const damage = Math.random() < 0.5 ? -1000 : -3000;
            applyScoreChange(target, damage);

            target.hand = [];
            target.defenseCard = null;
            target.immunityCount = 2;

            affectedLogs.push(`P${target.number}(${damage}点・手札防御全破棄・選択不可2T)`);
        });

        broadcastGameState(`P${caster.number} が「地震」を発動！ (対象: ${affectedLogs.join(' / ')})`);
    }, 2000);
}

function executeShotgunAttack(attackerId, targetTypeOrId) {
    const attacker = gameState.players[attackerId];
    if (!attacker) return;

    if (targetTypeOrId === 'ALL_LOWER') {
        const attackedPlayerIds = new Set();

        function processNextLowerTarget() {
            const currentPlayers = Object.values(gameState.players);
            const currentAttackerScore = gameState.players[attackerId].score;

            const lowerPlayers = currentPlayers.filter(p =>
                p.score < currentAttackerScore &&
                !attackedPlayerIds.has(p.id) &&
                (!p.immunityCount || p.immunityCount <= 0) &&
                !cannotSelectAsAttackTargetInRound1(attackerId, p.id)
            );

            if (lowerPlayers.length === 0) {
                if (attackedPlayerIds.size === 0) {
                    broadcastGameState(`P${attacker.number} が「ショットガン」を使用しましたが、対象となる下位プレイヤーがいませんでした。`);
                }
                return;
            }

            lowerPlayers.sort((a, b) => b.score - a.score);

            const topScore = lowerPlayers[0].score;
            const topGroup = lowerPlayers.filter(p => p.score === topScore);

            const target = topGroup[Math.floor(Math.random() * topGroup.length)];
            attackedPlayerIds.add(target.id);

            if (skipIfImmuneToRound1CardEffect(target, attacker, '「ショットガン」攻撃')) {
                setTimeout(processNextLowerTarget, 500);
                return;
            }

            let baseHitRate = 0.5;
            if (attacker.darknessTurns && attacker.darknessTurns > 0) {
                baseHitRate = 0.25;
            }
            const isHit = Math.random() < baseHitRate;
            let logPrefix = `P${attacker.number} の「ショットガン」攻撃 (対象: P${target.number})！ `;

            if (!isHit) {
                broadcastGameState(logPrefix + `(命中率:${baseHitRate * 100}%) 攻撃は外れた！（ミス）`);
                setTimeout(processNextLowerTarget, 500);
                return;
            }

            let penetrateMsg = '';
            if (target.defenseCard) {
                penetrateMsg = ` (相手の防御カード「${target.defenseCard.card.name}」を貫通！)`;
            }

            if (target.invincibleTurns && target.invincibleTurns > 0) {
                if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
                broadcastGameState(logPrefix + `命中！${penetrateMsg} しかし P${target.number} は「無敵状態」のため攻撃が無効化されました！（攻撃終了）`);
                return;
            }

            if (target.steroidTurns && target.steroidTurns > 0) {
                target.steroidRevealed = true;
                broadcastGameState(logPrefix + `命中！${penetrateMsg} しかし P${target.number} は「ステロイド状態」のため攻撃が無効化されました！（攻撃終了）`);
                return;
            }

            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            broadcastGameState(logPrefix + `命中ヒット！${penetrateMsg} 得点-3000点！ (P${target.number}は選択不可状態になりました。攻撃終了)`);
        }

        processNextLowerTarget();
        return;
    }

    const target = gameState.players[targetTypeOrId];
    if (!target) return;

    if (skipIfImmuneToRound1CardEffect(target, attacker, '「ショットガン」攻撃')) return;

    const scoreDiff = target.score - attacker.score;
    if (scoreDiff < 0 || scoreDiff > 5000) {
        const socket = io.sockets.sockets.get(attackerId);
        if (socket) {
            socket.emit('errorMessage', '自分との得点差が0点以上+5000点以下のプレイヤーのみ攻撃対象に指定できます。');
        }
        return;
    }

    let baseHitRate = 0.5;
    if (attacker.darknessTurns && attacker.darknessTurns > 0) {
        baseHitRate = 0.25;
    }
    let logPrefix = `P${attacker.number} が P${target.number} に「ショットガン」で攻撃！ `;
    const isHit = Math.random() < baseHitRate;

    if (!isHit) {
        broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 攻撃は外れた！（ミス）`);
        return;
    }

    let penetrateMsg = '';
    if (target.defenseCard) {
        penetrateMsg = ` (相手の防御カード「${target.defenseCard.card.name}」を貫通！)`;
    }

    if (target.invincibleTurns && target.invincibleTurns > 0) {
        if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
        broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中！${penetrateMsg} しかし P${target.number} は「無敵状態」のため攻撃が無効化されました！`);
        return;
    }

    if (target.steroidTurns && target.steroidTurns > 0) {
        target.steroidRevealed = true;
        broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中！${penetrateMsg} しかし P${target.number} は「ステロイド状態」のため攻撃が無効化されました！`);
        return;
    }

    applyScoreChange(target, -3000);
    target.immunityCount = 2;
    broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中ヒット！${penetrateMsg} 得点-3000点！ (P${target.number}は選択不可状態になりました)`);
}

function executeBronzeShieldClosestAttack(attackerId) {
    const attacker = gameState.players[attackerId];
    if (!attacker) return;

    const myScore = attacker.score;
    const allPlayers = Object.values(gameState.players);

    const candidates = allPlayers.filter(p => {
        if (p.id === attackerId) return false;
        if (p.immunityCount && p.immunityCount > 0) return false;
        if (cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
        const diff = p.score - myScore;
        return diff >= 0 && diff <= 10000;
    });

    if (candidates.length === 0) {
        broadcastGameState(`P${attacker.number} が「青銅の盾」で攻撃を行いましたが、対象となるプレイヤーがいませんでした。`);
        return;
    }

    const minDiff = Math.min(...candidates.map(p => p.score - myScore));
    const closestCandidates = candidates.filter(p => (p.score - myScore) === minDiff);
    const target = closestCandidates[Math.floor(Math.random() * closestCandidates.length)];

    if (skipIfImmuneToRound1CardEffect(target, attacker, '「青銅の盾」攻撃')) return;

    let logPrefix = `P${attacker.number} が P${target.number} に「青銅の盾」で攻撃！ (必中) `;

    if (target.defenseCard) {
        if (isDefenseBlocked(target, attacker)) {
            broadcastGameState(logPrefix + `命中！相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！`);
        } else {
            target.defenseCard.usesLeft -= 1;
            let msg = logPrefix + `命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
            if (target.defenseCard.card.id === 'grenade') {
                executeGrenadeDefenseCounter(target.id);
            }
            if (target.defenseCard && target.defenseCard.usesLeft <= 0) {
                target.defenseCard = null;
                msg += '（相手の防御カード破棄）';
            }
            broadcastGameState(msg);
            return;
        }
    }

    if (target.steroidTurns && target.steroidTurns > 0) {
        target.steroidRevealed = true;
        broadcastGameState(logPrefix + `命中！しかし P${target.number} は「ステロイド状態」のため攻撃が無効化されました！`);
        return;
    }
    if (target.invincibleTurns && target.invincibleTurns > 0) {
        if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
        broadcastGameState(logPrefix + `命中！しかし P${target.number} は「無敵状態」のため攻撃が無効化されました！`);
        return;
    }

    applyScoreChange(target, -3000);
    target.immunityCount = 2;
    broadcastGameState(logPrefix + `命中ヒット！ 得点-3000点！ (P${target.number}は選択不可状態になりました)`);
}

function executeBronzeShieldGroupAttack(attackerId) {
    const attacker = gameState.players[attackerId];
    if (!attacker) return;

    const myScore = attacker.score;

    let candidates = Object.values(gameState.players).filter(p => {
        if (p.id === attackerId) return false;
        if (p.immunityCount && p.immunityCount > 0) return false;
        if (cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
        return p.score < myScore;
    });

    if (candidates.length === 0) {
        broadcastGameState(`P${attacker.number} が「青銅の盾」で攻撃を開始しましたが、対象となる下位プレイヤーがいませんでした。`);
        return;
    }

    const grouped = {};
    candidates.forEach(p => {
        const diff = Math.abs(myScore - p.score);
        if (!grouped[diff]) grouped[diff] = [];
        grouped[diff].push(p);
    });

    const sortedDiffs = Object.keys(grouped).map(Number).sort((a, b) => a - b);
    const attackQueue = [];

    sortedDiffs.forEach(diff => {
        const group = grouped[diff];
        for (let i = group.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [group[i], group[j]] = [group[j], group[i]];
        }
        attackQueue.push(...group);
    });

    function processQueue(index) {
        if (index >= attackQueue.length) {
            broadcastGameState(`P${attacker.number} の「青銅の盾」攻撃は誰にも命中・無効化されず終了しました。`);
            return;
        }

        const target = gameState.players[attackQueue[index].id];
        if (!target) {
            processQueue(index + 1);
            return;
        }

        if (skipIfImmuneToRound1CardEffect(target, attacker, '「青銅の盾」攻撃')) {
            processQueue(index + 1);
            return;
        }

        let hitRate = getBronzeShieldLowerHitRate(attacker.score, target.score);
        if (attacker.darknessTurns && attacker.darknessTurns > 0) {
            hitRate = hitRate * 0.5;
        }

        if (hitRate <= 0) {
            processQueue(index + 1);
            return;
        }

        const ratePercent = Math.round(hitRate * 100);
        let logPrefix = `P${attacker.number} の「青銅の盾」攻撃 (対象: P${target.number})！ `;

        const isHit = Math.random() < hitRate;

        if (!isHit) {
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 攻撃は外れた！（ミス）`);
            setTimeout(() => processQueue(index + 1), 500);
            return;
        }

        if (target.defenseCard) {
            if (isDefenseBlocked(target, attacker)) {
                broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！`);
            } else {
                target.defenseCard.usesLeft -= 1;
                let msg = logPrefix + `(命中率:${ratePercent}%) 命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！（攻撃終了）`;
                if (target.defenseCard.card.id === 'grenade') {
                    executeGrenadeDefenseCounter(target.id);
                }
                if (target.defenseCard && target.defenseCard.usesLeft <= 0) {
                    target.defenseCard = null;
                    msg += '（相手の防御カード破棄）';
                }
                broadcastGameState(msg);
                return;
            }
        }

        if (target.steroidTurns && target.steroidTurns > 0) {
            target.steroidRevealed = true;
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし P${target.number} は「ステロイド状態」のため攻撃が無効化されました！（攻撃終了）`);
            return;
        }
        if (target.invincibleTurns && target.invincibleTurns > 0) {
            if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし P${target.number} は「無敵状態」のため攻撃が無効化されました！（攻撃終了）`);
            return;
        }

        applyScoreChange(target, -3000);
        target.immunityCount = 2;
        broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中ヒット！ 得点-3000点！ (P${target.number}は選択不可状態になりました。攻撃終了)`);
    }

    processQueue(0);
}

function executeWoodShieldGroupAttack(attackerId, groupType) {
    const attacker = gameState.players[attackerId];
    if (!attacker) return;

    const myScore = attacker.score;

    let candidates = Object.values(gameState.players).filter(p => {
        if (p.id === attackerId) return false;
        if (p.immunityCount && p.immunityCount > 0) return false;
        if (cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;

        if (groupType === 'EQUAL_OR_HIGHER') {
            return p.score >= myScore;
        } else if (groupType === 'LOWER') {
            return p.score < myScore;
        }
        return false;
    });

    if (candidates.length === 0) {
        broadcastGameState(`P${attacker.number} が「木の盾」で攻撃を開始しましたが、対象となるプレイヤーがいませんでした。`);
        return;
    }

    const grouped = {};
    candidates.forEach(p => {
        const diff = Math.abs(myScore - p.score);
        if (!grouped[diff]) grouped[diff] = [];
        grouped[diff].push(p);
    });

    const sortedDiffs = Object.keys(grouped).map(Number).sort((a, b) => a - b);
    const attackQueue = [];

    sortedDiffs.forEach(diff => {
        const group = grouped[diff];
        for (let i = group.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [group[i], group[j]] = [group[j], group[i]];
        }
        attackQueue.push(...group);
    });

    function processQueue(index) {
        if (index >= attackQueue.length) {
            broadcastGameState(`P${attacker.number} の「木の盾」攻撃は誰にも命中・無効化されず終了しました。`);
            return;
        }

        const target = gameState.players[attackQueue[index].id];
        if (!target) {
            processQueue(index + 1);
            return;
        }

        if (skipIfImmuneToRound1CardEffect(target, attacker, '「木の盾」攻撃')) {
            processQueue(index + 1);
            return;
        }

        let hitRate = getWoodShieldHitRate(attacker.score, target.score);
        if (attacker.darknessTurns && attacker.darknessTurns > 0) {
            hitRate = hitRate * 0.5;
        }

        if (hitRate <= 0) {
            processQueue(index + 1);
            return;
        }

        const ratePercent = Math.round(hitRate * 100);
        let logPrefix = `P${attacker.number} の「木の盾」攻撃 (対象: P${target.number})！ `;

        const isHit = Math.random() < hitRate;

        if (!isHit) {
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 攻撃は外れた！（ミス）`);
            setTimeout(() => processQueue(index + 1), 500);
            return;
        }

        if (target.defenseCard) {
            if (isDefenseBlocked(target, attacker)) {
                broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！`);
            } else {
                target.defenseCard.usesLeft -= 1;
                let msg = logPrefix + `(命中率:${ratePercent}%) 命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！（攻撃中断）`;
                if (target.defenseCard.card.id === 'grenade') {
                    executeGrenadeDefenseCounter(target.id);
                }
                if (target.defenseCard && target.defenseCard.usesLeft <= 0) {
                    target.defenseCard = null;
                    msg += '（相手の防御カード破棄）';
                }
                broadcastGameState(msg);
                return;
            }
        }

        if (target.steroidTurns && target.steroidTurns > 0) {
            target.steroidRevealed = true;
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし P${target.number} は「ステロイド状態」のため攻撃が無効化されました！（攻撃中断）`);
            return;
        }
        if (target.invincibleTurns && target.invincibleTurns > 0) {
            if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし P${target.number} は「無敵状態」のため攻撃が無効化されました！（攻撃中断）`);
            return;
        }

        applyScoreChange(target, -3000);
        target.immunityCount = 2;
        broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中ヒット！ 得点-3000点！ (P${target.number}は選択不可状態になりました。攻撃中断)`);
    }

    processQueue(0);
}

function executeShieldSetGroupAttack(attackerId, groupType, cardObj, maxAttacks, onComplete) {
    const attacker = gameState.players[attackerId];
    if (!attacker) {
        onComplete();
        return;
    }

    const myScore = attacker.score;

    function getCandidates() {
        return Object.values(gameState.players).filter(p => {
            if (p.id === attackerId) return false;
            if (p.immunityCount && p.immunityCount > 0) return false;
            if (cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;

            if (groupType === 'EQUAL_OR_HIGHER') {
                return p.score >= myScore;
            } else if (groupType === 'LOWER') {
                return p.score < myScore;
            }
            return false;
        });
    }

    let attackCountUsed = 0;

    function startSingleGroupAttack() {
        const candidates = getCandidates();

        if (candidates.length === 0 || attackCountUsed >= maxAttacks || cardObj.usesLeft <= 0) {
            onComplete();
            return;
        }

        const grouped = {};
        candidates.forEach(p => {
            const diff = Math.abs(myScore - p.score);
            if (!grouped[diff]) grouped[diff] = [];
            grouped[diff].push(p);
        });

        const sortedDiffs = Object.keys(grouped).map(Number).sort((a, b) => a - b);
        const attackQueue = [];

        sortedDiffs.forEach(diff => {
            const group = grouped[diff];
            for (let i = group.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [group[i], group[j]] = [group[j], group[i]];
            }
            attackQueue.push(...group);
        });

        function processQueue(index) {
            if (index >= attackQueue.length) {
                attackCountUsed++;
                cardObj.usesLeft -= 1;

                broadcastGameState(`P${attacker.number} の「木の盾セット」グループ攻撃は全員に外れました。（消費回数: ${attackCountUsed}/${maxAttacks}）`);

                setTimeout(() => {
                    startSingleGroupAttack();
                }, 500);
                return;
            }

            const target = gameState.players[attackQueue[index].id];
            if (!target) {
                processQueue(index + 1);
                return;
            }

            if (skipIfImmuneToRound1CardEffect(target, attacker, '「木の盾セット」攻撃')) {
                processQueue(index + 1);
                return;
            }

            let hitRate = getWoodShieldHitRate(attacker.score, target.score);
            if (attacker.darknessTurns && attacker.darknessTurns > 0) {
                hitRate = hitRate * 0.5;
            }
            if (hitRate <= 0) {
                processQueue(index + 1);
                return;
            }

            const ratePercent = Math.round(hitRate * 100);
            let logPrefix = `P${attacker.number} の「木の盾セット」攻撃 (${attackCountUsed + 1}/${maxAttacks}回目, 対象: P${target.number})！ `;

            const isHit = Math.random() < hitRate;

            if (!isHit) {
                broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 攻撃は外れた！（ミス）`);
                setTimeout(() => processQueue(index + 1), 500);
                return;
            }

            attackCountUsed++;
            cardObj.usesLeft -= 1;

            if (target.defenseCard) {
                if (isDefenseBlocked(target, attacker)) {
                    broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！`);
                } else {
                    target.defenseCard.usesLeft -= 1;
                    let msg = logPrefix + `(命中率:${ratePercent}%) 命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
                    if (target.defenseCard.card.id === 'grenade') {
                        executeGrenadeDefenseCounter(target.id);
                    }
                    if (target.defenseCard && target.defenseCard.usesLeft <= 0) {
                        target.defenseCard = null;
                        msg += '（相手の防御カード破棄）';
                    }
                    broadcastGameState(msg);
                    setTimeout(() => startSingleGroupAttack(), 500);
                    return;
                }
            }

            if (target.steroidTurns && target.steroidTurns > 0) {
                target.steroidRevealed = true;
                broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし P${target.number} は「ステロイド状態」のため攻撃が無効化されました！（攻撃中断）`);
                onComplete();
                return;
            }

            if (target.invincibleTurns && target.invincibleTurns > 0) {
                if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
                broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし P${target.number} は「無敵状態」のため攻撃が無効化されました！（攻撃中断）`);
                onComplete();
                return;
            }

            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中ヒット！ 得点-3000点！ (P${target.number}は選択不可状態になりました)`);

            setTimeout(() => startSingleGroupAttack(), 500);
        }

        processQueue(0);
    }

    startSingleGroupAttack();
}

function executeWoodSwordSetAttack(attackerId, targetId, cardObj, maxAttacks, onComplete) {
    const attacker = gameState.players[attackerId];
    const target = gameState.players[targetId];

    if (!attacker || !target) {
        onComplete();
        return;
    }

    if (skipIfImmuneToRound1CardEffect(target, attacker, '「木の剣セット」攻撃')) {
        onComplete();
        return;
    }

    const scoreDiff = target.score - attacker.score;
    if (scoreDiff < 0 || scoreDiff > 5000) {
        const socket = io.sockets.sockets.get(attackerId);
        if (socket) {
            socket.emit('errorMessage', '自分との得点差が0点以上+5000点以下のプレイヤーのみ攻撃対象に指定できます。');
        }
        onComplete();
        return;
    }

    let attackIndex = 0;

    function doNextAttack() {
        if (attackIndex >= maxAttacks || cardObj.usesLeft <= 0) {
            onComplete();
            return;
        }

        attackIndex++;
        cardObj.usesLeft -= 1;

        let baseHitRate = 0.5;
        if (attacker.darknessTurns && attacker.darknessTurns > 0) {
            baseHitRate = 0.25;
        }

        let logPrefix = `P${attacker.number} が P${target.number} に「木の剣セット」で攻撃 (${attackIndex}/${maxAttacks}回目)！ `;
        const isHit = Math.random() < baseHitRate;

        if (!isHit) {
            broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 攻撃は外れた！（ミス）`);
            if (attackIndex < maxAttacks && cardObj.usesLeft > 0) {
                setTimeout(doNextAttack, 500);
            } else {
                onComplete();
            }
            return;
        }

        if (target.defenseCard) {
            if (isDefenseBlocked(target, attacker)) {
                broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中！相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！`);
            } else {
                target.defenseCard.usesLeft -= 1;
                let msg = logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
                if (target.defenseCard.card.id === 'grenade') {
                    executeGrenadeDefenseCounter(target.id);
                }
                if (target.defenseCard && target.defenseCard.usesLeft <= 0) {
                    target.defenseCard = null;
                    msg += '（相手の防御カード破棄）';
                }
                broadcastGameState(msg);

                if (attackIndex < maxAttacks && cardObj.usesLeft > 0) {
                    setTimeout(doNextAttack, 500);
                } else {
                    onComplete();
                }
                return;
            }
        }

        if (target.invincibleTurns && target.invincibleTurns > 0) {
            if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし P${target.number} は「無敵状態」のため攻撃が無効化されました！（攻撃中断）`);
            onComplete();
            return;
        }

        if (target.steroidTurns && target.steroidTurns > 0) {
            target.steroidRevealed = true;
            broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし P${target.number} は「ステロイド状態」のため攻撃が無効化されました！（攻撃中断）`);
            onComplete();
            return;
        }

        applyScoreChange(target, -3000);
        target.immunityCount = 2;
        broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中ヒット！ 得点-3000点！ (P${target.number}は選択不可状態になりました。攻撃中断)`);
        onComplete();
    }

    doNextAttack();
}

function executeWoodSwordSetGroupAttack(attackerId, cardObj, maxAttacks, onComplete) {
    const attacker = gameState.players[attackerId];
    if (!attacker) {
        onComplete();
        return;
    }

    const myScore = attacker.score;

    function getCandidates() {
        return Object.values(gameState.players).filter(p => {
            if (p.id === attackerId) return false;
            if (p.immunityCount && p.immunityCount > 0) return false;
            if (cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
            return p.score < myScore;
        });
    }

    let attackCountUsed = 0;

    function startSingleGroupAttack() {
        const candidates = getCandidates();

        if (candidates.length === 0 || attackCountUsed >= maxAttacks || cardObj.usesLeft <= 0) {
            onComplete();
            return;
        }

        const grouped = {};
        candidates.forEach(p => {
            const diff = Math.abs(myScore - p.score);
            if (!grouped[diff]) grouped[diff] = [];
            grouped[diff].push(p);
        });

        const sortedDiffs = Object.keys(grouped).map(Number).sort((a, b) => a - b);
        const attackQueue = [];

        sortedDiffs.forEach(diff => {
            const group = grouped[diff];
            for (let i = group.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [group[i], group[j]] = [group[j], group[i]];
            }
            attackQueue.push(...group);
        });

        function processQueue(index) {
            if (index >= attackQueue.length) {
                attackCountUsed++;
                cardObj.usesLeft -= 1;

                broadcastGameState(`P${attacker.number} の「木の剣セット」グループ攻撃は全員に外れました。（消費回数: ${attackCountUsed}/${maxAttacks}）`);

                setTimeout(() => {
                    startSingleGroupAttack();
                }, 500);
                return;
            }

            const target = gameState.players[attackQueue[index].id];
            if (!target) {
                processQueue(index + 1);
                return;
            }

            if (skipIfImmuneToRound1CardEffect(target, attacker, '「木の剣セット」攻撃')) {
                processQueue(index + 1);
                return;
            }

            let baseHitRate = 0.5;
            if (attacker.darknessTurns && attacker.darknessTurns > 0) {
                baseHitRate = 0.25;
            }

            const ratePercent = Math.round(baseHitRate * 100);
            let logPrefix = `P${attacker.number} の「木の剣セット」攻撃 (${attackCountUsed + 1}/${maxAttacks}回目, 対象: P${target.number})！ `;

            const isHit = Math.random() < baseHitRate;

            if (!isHit) {
                broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 攻撃は外れた！（ミス）`);
                setTimeout(() => processQueue(index + 1), 500);
                return;
            }

            attackCountUsed++;
            cardObj.usesLeft -= 1;

            if (target.defenseCard) {
                if (isDefenseBlocked(target, attacker)) {
                    broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！`);
                } else {
                    target.defenseCard.usesLeft -= 1;
                    let msg = logPrefix + `(命中率:${ratePercent}%) 命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
                    if (target.defenseCard.card.id === 'grenade') {
                        executeGrenadeDefenseCounter(target.id);
                    }
                    if (target.defenseCard && target.defenseCard.usesLeft <= 0) {
                        target.defenseCard = null;
                        msg += '（相手の防御カード破棄）';
                    }
                    broadcastGameState(msg);
                    setTimeout(() => startSingleGroupAttack(), 500);
                    return;
                }
            }

            if (target.steroidTurns && target.steroidTurns > 0) {
                target.steroidRevealed = true;
                broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし P${target.number} は「ステロイド状態」のため攻撃が無効化されました！（攻撃中断）`);
                onComplete();
                return;
            }

            if (target.invincibleTurns && target.invincibleTurns > 0) {
                if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
                broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし P${target.number} は「無敵状態」のため攻撃が無効化されました！（攻撃中断）`);
                onComplete();
                return;
            }

            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中ヒット！ 得点-3000点！ (P${target.number}は選択不可状態になりました)`);

            setTimeout(() => startSingleGroupAttack(), 500);
        }

        processQueue(0);
    }

    startSingleGroupAttack();
}

function executeDiamondSword(casterSocketId) {
    const caster = gameState.players[casterSocketId];
    if (!caster) return;

    const allPlayers = Object.values(gameState.players);
    const maxScore = Math.max(...allPlayers.map(p => p.score));

    const targetPlayers = allPlayers.filter(p => Math.abs(maxScore - p.score) <= 1000);

    const affectedLogs = [];

    targetPlayers.forEach(target => {
        if (target.id !== casterSocketId && isImmuneToRound1CardEffect(target.id, casterSocketId)) {
            affectedLogs.push(`P${target.number}(1巡目効果無効)`);
            return;
        }

        const obanIndex = target.hand ? target.hand.findIndex(c => c.id === 'omamori_oban') : -1;
        const kobanSetIndex = target.hand ? target.hand.findIndex(c => c.id === 'omamori_koban_set') : -1;
        const kobanIndex = target.hand ? target.hand.findIndex(c => c.id === 'omamori_koban') : -1;

        if (obanIndex !== -1) {
            target.hand.splice(obanIndex, 1);
            applyScoreChange(target, 8000);
            affectedLogs.push(`P${target.number}(「お守り大判」が身代わり発動！効果無効化＆+8000点獲得)`);
            return;
        } else if (kobanSetIndex !== -1) {
            const kobanSet = target.hand[kobanSetIndex];
            if (!kobanSet.usesLeft) kobanSet.usesLeft = 3;
            kobanSet.usesLeft -= 1;
            applyScoreChange(target, 2000);

            let subMsg = '';
            if (kobanSet.usesLeft <= 0) {
                target.hand.splice(kobanSetIndex, 1);
                subMsg = '・カード破棄';
            } else {
                subMsg = `・残り${kobanSet.usesLeft}回`;
            }
            affectedLogs.push(`P${target.number}(「お守り小判セット」が身代わり発動！効果無効化＆+2000点獲得${subMsg})`);
            return;
        } else if (kobanIndex !== -1) {
            target.hand.splice(kobanIndex, 1);
            applyScoreChange(target, 3000);
            affectedLogs.push(`P${target.number}(「お守り小判」が身代わり発動！効果無効化＆+3000点獲得)`);
            return;
        }

        const isInvincible = target.invincibleTurns && target.invincibleTurns > 0;
        const isSteroid = target.steroidTurns && target.steroidTurns > 0;
        const isImmune = target.immunityCount && target.immunityCount > 0;

        if (isInvincible || isSteroid || isImmune) {
            if (isInvincible && target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            if (isSteroid) target.steroidRevealed = true;

            let defMsg = '';
            if (target.defenseCard) {
                target.defenseCard = null;
                defMsg = '防御カード破棄';
            }
            const stateName = isInvincible ? '無敵' : (isSteroid ? 'ステロイド' : '選択不可');
            affectedLogs.push(`P${target.number}(${stateName}ガード${defMsg ? '・' + defMsg : ''})`);
        } else {
            target.hand = [];
            target.defenseCard = null;
            applyScoreChange(target, -5000);
            target.immunityCount = 2;
            affectedLogs.push(`P${target.number}(-5000点・手札防御全破棄・選択不可2T)`);
        }
    });

    broadcastGameState(`P${caster.number} が「ダイヤの剣」を発動！ (対象: ${affectedLogs.join(' / ')})`);
}

function executeStandardAttack(attackerId, targetId, cardId) {
    const attacker = gameState.players[attackerId];
    const target = gameState.players[targetId];

    if (skipIfImmuneToRound1CardEffect(target, attacker, '攻撃')) return;

    const cardName = cardId === 'wood_sword' ? '木の剣' : '木の盾';
    const isSteroid = target.steroidTurns && target.steroidTurns > 0;
    let logPrefix = `P${attacker.number} が P${target.number} に「${cardName}」で攻撃！ `;

    let hitRate = 0.5;
    if (cardId === 'wood_shield') {
        hitRate = getWoodShieldHitRate(attacker.score, target.score);
    }
    if (attacker.darknessTurns && attacker.darknessTurns > 0) {
        hitRate = hitRate * 0.5;
    }

    if (hitRate <= 0) {
        return;
    }

    let isHit = Math.random() < hitRate;
    let ratePercent = Math.round(hitRate * 100);
    let rateText = `(命中率:${ratePercent}%) `;

    if (!isHit) {
        broadcastGameState(logPrefix + rateText + `攻撃は外れた！（ミス）`);
        return;
    }

    if (target.defenseCard) {
        if (isDefenseBlocked(target, attacker)) {
            broadcastGameState(logPrefix + rateText + `命中！相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！`);
        } else {
            target.defenseCard.usesLeft -= 1;
            let msg = logPrefix + rateText + `命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
            if (target.defenseCard.card.id === 'grenade') {
                executeGrenadeDefenseCounter(target.id);
            }
            if (target.defenseCard && target.defenseCard.usesLeft <= 0) {
                target.defenseCard = null;
                msg += '（相手の防御カード破棄）';
            }
            broadcastGameState(msg);
            return;
        }
    }

    if (target.invincibleTurns && target.invincibleTurns > 0) {
        if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
        broadcastGameState(logPrefix + rateText + `命中！しかし P${target.number} は「無敵状態」のため攻撃が無効化されました！`);
        return;
    }

    if (isSteroid) {
        target.steroidRevealed = true;
        broadcastGameState(logPrefix + rateText + `命中！しかし P${target.number} は「ステロイド状態」のため攻撃が無効化されました！`);
        return;
    }

    applyScoreChange(target, -3000);
    target.immunityCount = 2;
    broadcastGameState(logPrefix + rateText + `命中ヒット！ 得点-3000点！ (P${target.number}は選択不可状態になりました)`);
}

function executeWoodSwordAttack(attackerId, targetTypeOrId) {
    const attacker = gameState.players[attackerId];
    if (!attacker) return;

    if (targetTypeOrId === 'ALL_LOWER') {
        const attackedPlayerIds = new Set();

        function processNextLowerTarget() {
            const currentPlayers = Object.values(gameState.players);
            const currentAttackerScore = gameState.players[attackerId].score;

            const lowerPlayers = currentPlayers.filter(p =>
                p.score < currentAttackerScore &&
                !attackedPlayerIds.has(p.id) &&
                (!p.immunityCount || p.immunityCount <= 0) &&
                !cannotSelectAsAttackTargetInRound1(attackerId, p.id)
            );
            if (lowerPlayers.length === 0) {
                if (attackedPlayerIds.size === 0) {
                    broadcastGameState(`P${attacker.number} が「木の剣」を使用しましたが、対象となる下位プレイヤーがいませんでした。`);
                }
                return;
            }

            lowerPlayers.sort((a, b) => b.score - a.score);

            const topScore = lowerPlayers[0].score;
            const topGroup = lowerPlayers.filter(p => p.score === topScore);

            const target = topGroup[Math.floor(Math.random() * topGroup.length)];
            attackedPlayerIds.add(target.id);

            if (skipIfImmuneToRound1CardEffect(target, attacker, '「木の剣」攻撃')) {
                setTimeout(processNextLowerTarget, 500);
                return;
            }

            const isSteroid = target.steroidTurns && target.steroidTurns > 0;
            let logPrefix = `P${attacker.number} の「木の剣」攻撃 (対象: P${target.number})！ `;

            let baseHitRate = 0.5;
            if (attacker.darknessTurns && attacker.darknessTurns > 0) {
                baseHitRate = 0.25;
            }
            const isHit = Math.random() < baseHitRate;

            if (!isHit) {
                broadcastGameState(logPrefix + `(命中率:${baseHitRate * 100}%) 攻撃は外れた！（ミス）`);
                setTimeout(processNextLowerTarget, 500);
                return;
            }

            if (target.defenseCard) {
                if (isDefenseBlocked(target, attacker)) {
                    broadcastGameState(logPrefix + `命中！相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！`);
                } else {
                    target.defenseCard.usesLeft -= 1;
                    let msg = logPrefix + `命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
                    if (target.defenseCard.card.id === 'grenade') {
                        executeGrenadeDefenseCounter(target.id);
                    }
                    if (target.defenseCard && target.defenseCard.usesLeft <= 0) {
                        target.defenseCard = null;
                        msg += '（相手の防御カード破棄）';
                    }
                    broadcastGameState(msg);
                    return;
                }
            }

            if (target.invincibleTurns && target.invincibleTurns > 0) {
                if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
                broadcastGameState(logPrefix + `命中！しかし P${target.number} は「無敵状態」のため攻撃が無効化されました！`);
                return;
            }

            if (isSteroid) {
                target.steroidRevealed = true;
                broadcastGameState(logPrefix + `命中！しかし P${target.number} は「ステロイド状態」のため攻撃が無効化されました！`);
                return;
            }

            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            broadcastGameState(logPrefix + `命中ヒット！ 得点-3000点！ (P${target.number}は選択不可状態になりました。)`);
        }

        processNextLowerTarget();
        return;
    }

    const target = gameState.players[targetTypeOrId];
    if (!target) return;

    if (skipIfImmuneToRound1CardEffect(target, attacker, '「木の剣」攻撃')) return;

    const isSteroid = target.steroidTurns && target.steroidTurns > 0;
    const scoreDiff = target.score - attacker.score;

    if (scoreDiff < 0 || scoreDiff > 5000) {
        const socket = io.sockets.sockets.get(attackerId);
        if (socket) {
            socket.emit('errorMessage', '自分との得点差が0点以上+5000点以下のプレイヤーのみ攻撃対象に指定できます。');
        }
        return;
    }

    let baseHitRate = 0.5;
    if (attacker.darknessTurns && attacker.darknessTurns > 0) {
        baseHitRate = 0.25;
    }
    let logPrefix = `P${attacker.number} が P${target.number} に「木の剣」で攻撃！ `;
    const isHit = Math.random() < baseHitRate;

    if (!isHit) {
        broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 攻撃は外れた！（ミス）`);
        return;
    }

    if (target.defenseCard) {
        if (isDefenseBlocked(target, attacker)) {
            broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中！相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！`);
        } else {
            target.defenseCard.usesLeft -= 1;
            let msg = logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
            if (target.defenseCard.card.id === 'grenade') {
                executeGrenadeDefenseCounter(target.id);
            }
            if (target.defenseCard && target.defenseCard.usesLeft <= 0) {
                target.defenseCard = null;
                msg += '（相手の防御カード破棄）';
            }
            broadcastGameState(msg);
            return;
        }
    }

    if (target.invincibleTurns && target.invincibleTurns > 0) {
        if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
        broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし P${target.number} は「無敵状態」のため攻撃が無効化されました！`);
        return;
    }

    if (isSteroid) {
        target.steroidRevealed = true;
        broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし P${target.number} は「ステロイド状態」のため攻撃が無効化されました！`);
        return;
    }

    applyScoreChange(target, -3000);
    target.immunityCount = 2;
    broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中ヒット！ 得点-3000点！ (P${target.number}は選択不可状態になりました)`);
}

function executeShieldSetAttack(attackerId, targetId, cardObj, maxAttacks, onComplete) {
    const attacker = gameState.players[attackerId];
    const target = gameState.players[targetId];

    if (skipIfImmuneToRound1CardEffect(target, attacker, '「木の盾セット」攻撃')) {
        onComplete();
        return;
    }

    const hitRate = getWoodShieldHitRate(attacker.score, target.score);
    const isSteroid = target.steroidTurns && target.steroidTurns > 0;

    if (hitRate <= 0) {
        onComplete();
        return;
    }

    const ratePercent = Math.round(hitRate * 100);

    let attackIndex = 0;

    function doNextAttack() {
        if (attackIndex >= maxAttacks || cardObj.usesLeft <= 0) {
            onComplete();
            return;
        }

        attackIndex++;
        let logPrefix = `P${attacker.number} が P${target.number} に「木の盾セット」で攻撃 (${attackIndex}/${maxAttacks}回目)！ `;

        const isHit = Math.random() < hitRate;

        if (!isHit) {
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 攻撃は外れた！（ミス）`);
            setTimeout(doNextAttack, 500);
            return;
        }

        cardObj.usesLeft -= 1;

        if (target.defenseCard) {
            if (isDefenseBlocked(target, attacker)) {
                broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！`);
            } else {
                target.defenseCard.usesLeft -= 1;
                let msg = logPrefix + `(命中率:${ratePercent}%) 命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
                if (target.defenseCard.card.id === 'grenade') {
                    executeGrenadeDefenseCounter(target.id);
                }
                if (target.defenseCard && target.defenseCard.usesLeft <= 0) {
                    target.defenseCard = null;
                    msg += '（相手の防御カード破棄）';
                }
                broadcastGameState(msg);
                setTimeout(doNextAttack, 500);
                return;
            }
        }

        if (target.invincibleTurns && target.invincibleTurns > 0) {
            if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし P${target.number} は「無敵状態」のため攻撃が無効化されました！`);
            setTimeout(doNextAttack, 500);
            return;
        }

        if (isSteroid) {
            target.steroidRevealed = true;
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし P${target.number} は「ステロイド状態」のため攻撃が無効化されました！`);
            setTimeout(doNextAttack, 500);
            return;
        }

        applyScoreChange(target, -3000);
        target.immunityCount = 2;
        broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中ヒット！ 得点-3000点！ (P${target.number}が選択不可状態になったため攻撃中断)`);

        onComplete();
    }

    doNextAttack();
}

function executeDisasterAttack(casterSocketId) {
    const caster = gameState.players[casterSocketId];
    if (!caster) return;

    io.emit('showCutIn', {
        title: '大災害発動！',
        imagePath: '/images/disaster.png'
    });

    setTimeout(() => {
        const initialPlayers = Object.values(gameState.players).map(p => ({
            id: p.id,
            score: p.score
        }));

        const rankMap = {};
        initialPlayers.forEach(p => {
            const higherCount = initialPlayers.filter(other => other.score > p.score).length;
            rankMap[p.id] = higherCount + 1;
        });

        const damageByRank = {
            1: -6000,
            2: -4000,
            3: -2000,
            4: -1000
        };

        Object.values(gameState.players).forEach(player => {
            if (player.id === casterSocketId) return;

            if (isImmuneToRound1CardEffect(player.id, casterSocketId)) return;

            const rank = rankMap[player.id];
            const damage = damageByRank[rank] || 0;

            const isInvincible = player.invincibleTurns && player.invincibleTurns > 0;
            const isSteroid = player.steroidTurns && player.steroidTurns > 0;
            const isImmune = player.immunityCount && player.immunityCount > 0;

            if (isSteroid) {
                player.steroidTurns = 0;
                player.steroidRevealed = false;
                return;
            }

            if (isInvincible && player.invincibleSource === 'ARMOR') {
                player.armorRevealed = true;
            }

            if (!isInvincible && !isImmune) {
                applyScoreChange(player, damage);
                player.immunityCount = 2;
            }

            if (!isInvincible) {
                player.hand = [];
                player.defenseCard = null;
            }
        });

        broadcastGameState(`P${caster.number} が「大災害」を発動！`);

    }, 2000);
}

function executeDarkMatter(casterSocketId) {
    const player = gameState.players[casterSocketId];
    if (!player) return;

    player.invincibleTurns = 1;
    player.invincibleSource = 'DARK_MATTER';

    const prevMyScore = player.score;
    applyScoreChange(player, 5000);
    const newMyScore = player.score;

    const penalizedNames = [];

    Object.values(gameState.players).forEach(opponent => {
        if (opponent.id === player.id) return;

        if (isImmuneToRound1CardEffect(opponent.id, casterSocketId)) return;

        const isInvincible = opponent.invincibleTurns && opponent.invincibleTurns > 0;
        const isImmune = opponent.immunityCount && opponent.immunityCount > 0;
        if (isInvincible || isImmune) return;

        const isConditionA = (opponent.score === prevMyScore);
        const isConditionB = (opponent.score > prevMyScore && newMyScore >= opponent.score);

        if (isConditionA || isConditionB) {
            const isSuccess = Math.random() < 0.5;

            if (isSuccess) {
                opponent.hand = [];
                opponent.defenseCard = null;
                applyScoreChange(opponent, -3000);
                opponent.immunityCount = 2;

                penalizedNames.push(`P${opponent.number}(成功)`);
            } else {
                penalizedNames.push(`P${opponent.number}(不発)`);
            }
        }
    });

    let logMsg = `P${player.number} が「ダークマター」を使用！ 無敵状態になり、+5000点獲得！`;
    if (penalizedNames.length > 0) {
        logMsg += ` 対象結果: ${penalizedNames.join(', ')}`;
    }

    broadcastGameState(logMsg);
}

function executeSmokeScreen(casterSocketId) {
    const caster = gameState.players[casterSocketId];
    if (!caster) return;

    const playersArr = Object.values(gameState.players);
    const rankMap = {};
    playersArr.forEach(p => {
        const higherCount = playersArr.filter(other => other.score > p.score).length;
        rankMap[p.id] = higherCount + 1;
    });

    const myScore = caster.score;
    const opponents = playersArr.filter(p => p.id !== casterSocketId);

    const targets = opponents.filter(p => {
        if (p.score < myScore) return false;
        if (isImmuneToRound1CardEffect(p.id, casterSocketId)) return false;
        return true;
    });

    if (targets.length > 0) {
        const affectedNames = [];
        let anySuccess = false;

        targets.forEach(target => {
            const isInvincible = target.invincibleTurns && target.invincibleTurns > 0;
            const isSteroid = target.steroidTurns && target.steroidTurns > 0;

            if (isInvincible || isSteroid) {
                if (isInvincible && target.invincibleSource === 'ARMOR') target.armorRevealed = true;
                if (isSteroid) target.steroidRevealed = true;
                affectedNames.push(`P${target.number}(無効)`);
                return;
            }

            anySuccess = true;
            applyScoreChange(target, -1000);

            const rank = rankMap[target.id];
            const turns = (rank === 1) ? 2 : 1;
            target.darknessTurns = turns;

            affectedNames.push(`P${target.number}(${turns}T)`);
        });

        const statusSuffix = anySuccess ? " (-1000点 & 暗闇付与)" : "";
        broadcastGameState(`P${caster.number} が「煙幕」を使用！ 対象: ${affectedNames.join(', ')}${statusSuffix}`);
    } else {
        const isInvincible = caster.invincibleTurns && caster.invincibleTurns > 0;
        const isSteroid = caster.steroidTurns && caster.steroidTurns > 0;

        if (isInvincible || isSteroid) {
            broadcastGameState(`P${caster.number} が「煙幕」を使用！ 該当する相手がいないため自身に効果が跳ね返りましたが、無敵またはステロイド状態のため無効化されました。`);
            return;
        }

        applyScoreChange(caster, -1000);

        const myRank = rankMap[caster.id];
        const turns = (myRank === 1) ? 2 : 1;
        caster.darknessTurns = turns;

        broadcastGameState(`P${caster.number} が「煙幕」を使用！ 該当する相手がいないため自身に効果発動 (-1000点 & 暗闇${turns}ターン付与)`);
    }
}

server.listen(3000, () => {
    console.log('サーバーがポート 3000 で起動しました');
});