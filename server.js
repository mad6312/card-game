const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const {
    CARD_DECK,
    DEFAULT_AVATAR_ID,
    PRESET_AVATARS,
    createInitialCardSettings,
    getRandomAvailableCard
} = require('./cards');

const battle = require('./battle');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let cardSettings = createInitialCardSettings();
let showOtherPlayersInfo = true;
let skipBonusModal = true;
let ignoreDrawRestrictions = true; // デバッグドロー時の制限無視トグル（デフォルト: ON）

// 接続ソケットごとのプロファイル（未エントリー時も保持）
const socketProfiles = {};

function createInitialState() {
    return {
        started: false,
        players: {},
        turnOrder: [],
        currentTurnPlayerId: null,
        actedPlayerIds: [],
        round: 1,
        turnPhase: 'WAITING',
        cardCooldowns: {
            diamond_sword: 0,
            earthquake: 0,
            disaster: 0,
            smoke_screen: 0
        },
        draft: {
            phase: 'SELECTING',
            choices: {},
            availableScores: [5000, 1000, -1000, -5000],
            timer: null
        }
    };
}

let gameState = createInitialState();

function getSyncPayload(customLog = '') {
    return {
        players: gameState.players,
        turnOrder: gameState.turnOrder,
        currentTurnPlayerId: gameState.currentTurnPlayerId,
        actedPlayerIds: gameState.actedPlayerIds,
        round: gameState.round,
        turnPhase: gameState.turnPhase,
        showOtherPlayersInfo: showOtherPlayersInfo,
        skipBonusModal: skipBonusModal,
        ignoreDrawRestrictions: ignoreDrawRestrictions,
        started: gameState.started,
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

    broadcastGameState('4人揃いました！ゲームを開始します。');
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

function getNextPlayerId() {
    const allPlayers = Object.values(gameState.players);
    const unactedPlayers = allPlayers.filter(p => !gameState.actedPlayerIds.includes(p.id));
    if (unactedPlayers.length === 0) return null;

    if (gameState.round === 1) {
        const firstScore = allPlayers[0].score;
        const isAllEqualScore = allPlayers.every(p => p.score === firstScore);

        if (isAllEqualScore) {
            const sortedByNumber = [...unactedPlayers].sort((a, b) => a - b.number);
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
    broadcastGameState(`${caster.name} の${cardLabel} (対象: ${target.name})！ ${target.name} は1巡目のため、先行プレイヤーのカード効果を受けません。`);
    return true;
}

function proceedToNextTurn() {
    battle.resetScoreChanges(gameState);

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

    // 使用後出現制限（12Tクールダウンタイマー）の減算処理
    if (gameState.cardCooldowns) {
        Object.keys(gameState.cardCooldowns).forEach(cardId => {
            if (gameState.cardCooldowns[cardId] > 0) {
                gameState.cardCooldowns[cardId] -= 1;
            }
        });
    }

    const expireLogs = [];
    let hasScoreChangeOnExpire = false;

    // 1. バフ解除・時限爆弾処理
    Object.values(gameState.players).forEach(p => {
        if (p.invincibleTurns > 0 && p.invincibleSource === 'ARMOR') {
            p.invincibleTurns -= 1;
            if (p.invincibleTurns === 0) {
                p.invincibleSource = null;
                p.armorRevealed = false;
                const msg = battle.handleBuffExpire(gameState, p, 'ARMOR', isImmuneToRound1CardEffect, io);
                if (msg) expireLogs.push(msg);
                hasScoreChangeOnExpire = true;
            }
        }
        if (p.steroidTurns > 0) {
            p.steroidTurns -= 1;
            if (p.steroidTurns === 0) {
                p.steroidRevealed = false;
                const msg = battle.handleBuffExpire(gameState, p, 'STERIOD', isImmuneToRound1CardEffect, io);
                if (msg) expireLogs.push(msg);
                hasScoreChangeOnExpire = true;
            }
        }
        if (p.timeBombTurns > 0) {
            if (p.invincibleTurns > 0 || p.steroidTurns > 0) {
                p.timeBombTurns = 0;
            } else {
                p.timeBombTurns -= 1;
                if (p.timeBombTurns === 0) {
                    const autoRes = battle.tryAutoTriggerDefense(gameState, p, {
                        allowSteroid: true,
                        isImmuneToRound1CardEffect: isImmuneToRound1CardEffect,
                        broadcastGameState: broadcastGameState
                    });

                    if (autoRes) {
                        p.timeBombTurns = 0;
                        let dmLog = '';
                        if (autoRes.resolveDarkMatterPenalty) {
                            const dmRes = autoRes.resolveDarkMatterPenalty(gameState, io);
                            if (dmRes) {
                                if (dmRes.penaltyLogSuffix) dmLog = dmRes.penaltyLogSuffix;
                                if (dmRes.darkMatterCutinData && io) {
                                    io.emit('playAttackCutin', dmRes.darkMatterCutinData);
                                }
                            }
                        }
                        expireLogs.push(`💣 ${p.name} の「時限爆弾」が爆発寸前に手札から「${autoRes.cardName}」が自動発動！ 無敵/ステロイド状態になり爆発を無効化しました！\n(${autoRes.logMsg})${dmLog}`);
                        if (autoRes.cardId === 'dark_matter') hasScoreChangeOnExpire = true;
                    } else {
                        battle.applyScoreChange(p, -6000);
                        p.hand = [];
                        p.defenseCard = null;
                        p.immunityCount = 2;
                        expireLogs.push(`💣 ${p.name} の「時限爆弾」が爆発！ -6,000点、手札・防御全破棄、選択不可(2T)付与！`);
                        hasScoreChangeOnExpire = true;
                    }
                }
            }
        }
    });

    function finalizeNextTurn(alreadyLoggedExpire = false) {
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

        const nextTurnStartLogs = [];

        if (nextPlayerId) {
            const nextPlayer = gameState.players[nextPlayerId];
            nextPlayer.bombTransferAttempted = false;
            nextPlayer.bombDrawnThisTurn = false;
            nextPlayer.playedHandCardThisTurn = false;
            nextPlayer.playedObanThisTurn = false;
            nextPlayer.playedDarkMatterThisTurn = false;

            if (nextPlayer.invincibleTurns > 0 && nextPlayer.invincibleSource === 'DARK_MATTER') {
                nextPlayer.invincibleTurns = 0;
                nextPlayer.invincibleSource = null;
            }

            if (nextPlayer.timeBombTurns > 0) {
                if (nextPlayer.invincibleTurns > 0 || nextPlayer.steroidTurns > 0) {
                    nextPlayer.timeBombTurns = 0;
                } else if (!nextPlayer.bombDrawnThisTurn) {
                    battle.applyScoreChange(nextPlayer, 1000);
                    nextTurnStartLogs.push(`${nextPlayer.name} の「時限爆弾」保持ボーナス: +1,000点獲得！`);
                }
            }
        }

        let finalLog = '';
        if (!alreadyLoggedExpire && expireLogs.length > 0) {
            finalLog += expireLogs.join('\n') + '\n';
        }
        if (nextTurnStartLogs.length > 0) {
            finalLog += nextTurnStartLogs.join('\n') + '\n';
        }
        finalLog += `${gameState.players[gameState.currentTurnPlayerId].name} のターンになりました。`;

        broadcastGameState(finalLog);
    }

    if (hasScoreChangeOnExpire) {
        broadcastGameState(expireLogs.join('\n'));
        setTimeout(() => finalizeNextTurn(true), 650);
    } else {
        finalizeNextTurn(false);
    }
}

io.on('connection', (socket) => {
    console.log('接続:', socket.id);

    // 未エントリーソケット用の初期プロファイル
    socketProfiles[socket.id] = {
        name: `プレイヤー`,
        avatar: DEFAULT_AVATAR_ID
    };

    const isJoined = !!gameState.players[socket.id];
    const joinedCount = Object.keys(gameState.players).length;

    socket.emit('init', {
        id: socket.id,
        name: isJoined ? gameState.players[socket.id].name : socketProfiles[socket.id].name,
        avatar: isJoined ? gameState.players[socket.id].avatar : socketProfiles[socket.id].avatar,
        presetAvatars: PRESET_AVATARS,
        isJoined: isJoined,
        started: gameState.started,
        playerCount: joinedCount
    });

    socket.emit('updateCardSettings', cardSettings);
    socket.emit('updatePublicInfoSetting', showOtherPlayersInfo);
    socket.emit('updateBonusSkipSetting', skipBonusModal);
    socket.emit('updateDrawRestrictionsSetting', ignoreDrawRestrictions);

    if (gameState.started) {
        socket.emit('syncGameState', getSyncPayload(''));
    } else {
        socket.emit('playerUpdate', { playerCount: joinedCount, started: false });
    }

    // 参加する（エントリー）
    socket.on('joinGame', () => {
        if (gameState.started) {
            socket.emit('errorMessage', 'ゲームはすでに開始されています。');
            return;
        }
        if (gameState.players[socket.id]) return; // 既に参加中

        const currentPlayers = Object.values(gameState.players);
        if (currentPlayers.length >= 4) {
            socket.emit('errorMessage', '定員（4名）に達しているため参加できません。');
            return;
        }

        // 1〜4の中で空いている最小の番号を算出
        const usedNumbers = currentPlayers.map(p => p.number);
        let pNum = 1;
        for (let i = 1; i <= 4; i++) {
            if (!usedNumbers.includes(i)) {
                pNum = i;
                break;
            }
        }

        const profile = socketProfiles[socket.id] || { name: `P${pNum}`, avatar: DEFAULT_AVATAR_ID };
        let finalName = profile.name;
        if (!finalName || finalName === 'プレイヤー') {
            finalName = `P${pNum}`;
        }

        gameState.players[socket.id] = {
            id: socket.id,
            number: pNum,
            name: finalName,
            avatar: profile.avatar || DEFAULT_AVATAR_ID,
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
            playedObanThisTurn: false,
            playedDarkMatterThisTurn: false
        };

        socket.emit('joinSuccess', {
            playerNumber: pNum,
            name: finalName,
            avatar: profile.avatar || DEFAULT_AVATAR_ID
        });

        const newCount = Object.keys(gameState.players).length;
        io.emit('playerUpdate', { playerCount: newCount, started: false });

        if (newCount === 4) {
            skipDraftAndStartGame();
        }
    });

    // 参加キャンセル（エントリー解除）
    socket.on('cancelJoin', () => {
        if (gameState.started) {
            socket.emit('errorMessage', 'ゲーム開始後はキャンセルできません。');
            return;
        }
        if (!gameState.players[socket.id]) return;

        delete gameState.players[socket.id];
        socket.emit('cancelJoinSuccess');

        const newCount = Object.keys(gameState.players).length;
        io.emit('playerUpdate', { playerCount: newCount, started: false });
    });

    socket.on('changePlayerName', ({ newName }) => {
        const trimmed = (newName || '').trim();
        if (!trimmed) {
            socket.emit('errorMessage', 'プレイヤー名を入力してください。');
            return;
        }

        const cleanName = trimmed.slice(0, 10);
        if (socketProfiles[socket.id]) {
            socketProfiles[socket.id].name = cleanName;
        }

        const player = gameState.players[socket.id];
        if (player) {
            const oldName = player.name;
            player.name = cleanName;
            broadcastGameState(`[設定] 「${oldName}」がプレイヤー名を「${player.name}」に変更しました。`);
        } else {
            socket.emit('profileUpdated', { name: cleanName });
        }
    });

    socket.on('changePlayerAvatar', ({ avatarId }) => {
        if (avatarId === DEFAULT_AVATAR_ID) {
            socket.emit('errorMessage', 'デフォルトアバターに戻すことはできません。');
            return;
        }

        const valid = PRESET_AVATARS.some(a => a.id === avatarId);
        if (!valid) {
            socket.emit('errorMessage', '無効なアバターが選択されました。');
            return;
        }

        if (socketProfiles[socket.id]) {
            socketProfiles[socket.id].avatar = avatarId;
        }

        const player = gameState.players[socket.id];
        if (player) {
            player.avatar = avatarId;
            broadcastGameState(`[設定] ${player.name} がアバターを変更しました。`);
        } else {
            socket.emit('profileUpdated', { avatar: avatarId });
        }
    });

    socket.on('togglePublicInfoSetting', (enabled) => {
        showOtherPlayersInfo = enabled;
        io.emit('updatePublicInfoSetting', showOtherPlayersInfo);
        broadcastGameState(`[デバッグ] 他プレイヤー情報（手札・防御）を「${enabled ? '公開' : '非公開'}」に設定しました。`);
    });

    socket.on('toggleBonusSkipSetting', (enabled) => {
        skipBonusModal = enabled;
        io.emit('updateBonusSkipSetting', skipBonusModal);
        broadcastGameState(`[デバッグ] ボーナススキップを「${enabled ? 'ON' : 'OFF'}」に設定しました。`);
    });

    socket.on('toggleDrawRestrictionsSetting', (enabled) => {
        ignoreDrawRestrictions = enabled;
        io.emit('updateDrawRestrictionsSetting', ignoreDrawRestrictions);
        broadcastGameState(`[デバッグ] デバッグドロー制限無視を「${enabled ? 'ON' : 'OFF'}」に設定しました。`);
    });

    socket.on('debugUpdateScore', ({ targetPlayerId, amount, setDirect }) => {
        const target = gameState.players[targetPlayerId];
        if (!target) return;

        battle.resetScoreChanges(gameState);
        target.prevScore = target.score;

        if (setDirect) {
            const newScore = Number(amount);
            target.scoreChange = newScore - target.score;
            target.score = newScore;
        } else {
            target.scoreChange = Number(amount);
            target.score += Number(amount);
        }

        broadcastGameState(`[デバッグ] ${target.name} の得点が ${target.score.toLocaleString()} 点に変更されました。`);
    });

    socket.on('debugDrawCard', ({ targetPlayerId }) => {
        const target = gameState.players[targetPlayerId];
        if (!target) return;

        battle.resetScoreChanges(gameState);
        const randomCard = getRandomAvailableCard(target, cardSettings, gameState, ignoreDrawRestrictions);

        if (randomCard.id === 'time_bomb') {
            battle.applyScoreChange(target, 1000);
            target.timeBombTurns = 8;
            target.bombDrawnThisTurn = true;

            if (target.invincibleTurns > 0 || target.steroidTurns > 0) {
                target.timeBombTurns = 0;
                broadcastGameState(`[デバッグ] ${target.name} が「時限爆弾」をドローしましたが、無敵/ステロイド状態のため消滅しました！`);
            } else {
                io.emit('showCutIn', { title: '時限爆弾出現！', imagePath: '/images/time_bomb.png' });
                broadcastGameState(`[デバッグ] ${target.name} が「時限爆弾」をドロー！ +1,000点獲得＆時限爆弾状態(8T)付与！`);
            }
        } else {
            target.hand.push(randomCard);
            broadcastGameState(`[デバッグ] ${target.name} が山札から「${randomCard.name}」をドローしました。`);
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

    socket.on('chooseBonus', (data) => {
        battle.resetScoreChanges(gameState);
        const currentTurnId = gameState.currentTurnPlayerId;
        if (socket.id !== currentTurnId || gameState.turnPhase !== 'BONUS_CHOICE') return;

        const player = gameState.players[socket.id];
        const rawAmount = data ? (typeof data.scoreAmount === 'number' ? data.scoreAmount : (data.acceptBonus ? 3000 : 0)) : 3000;
        const scoreAmount = Math.min(3000, Math.max(-3000, Number(rawAmount) || 0));

        if (scoreAmount !== 0) {
            battle.applyScoreChange(player, scoreAmount);
        }

        const randomCard = getRandomAvailableCard(player, cardSettings, gameState, false);
        gameState.turnPhase = 'MAIN';

        let bonusLog = '';
        if (scoreAmount > 0) {
            bonusLog = ` (+${scoreAmount.toLocaleString()}点獲得)`;
        } else if (scoreAmount < 0) {
            bonusLog = ` (${scoreAmount.toLocaleString()}点)`;
        }

        if (randomCard.id === 'time_bomb') {
            battle.applyScoreChange(player, 1000);
            player.timeBombTurns = 8;
            player.bombDrawnThisTurn = true;

            if (player.invincibleTurns > 0 || player.steroidTurns > 0) {
                player.timeBombTurns = 0;
                broadcastGameState(`${player.name} が「時限爆弾」をドローしましたが、無敵/ステロイド状態のため消滅しました！${bonusLog}`);
            } else {
                io.emit('showCutIn', { title: '時限爆弾出現！', imagePath: '/images/time_bomb.png' });
                broadcastGameState(`${player.name} が「時限爆弾」をドロー！ +1,000点獲得＆時限爆弾状態(8T)付与！${bonusLog}`);
            }
        } else {
            player.hand.push(randomCard);
            socket.emit('syncGameState', getSyncPayload(`「${randomCard.name}」を獲得しました。${bonusLog}`));
            const otherLog = showOtherPlayersInfo ? `${player.name} がカードを1枚獲得しました。${bonusLog}` : '';
            socket.broadcast.emit('syncGameState', getSyncPayload(otherLog));
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
            broadcastGameState(`${player.name} が ${target.name} へ「時限爆弾」の受け渡しに成功しました！ (残り${target.timeBombTurns}T)`);
            socket.emit('transferTimeBombResult', { success: true });
        } else {
            broadcastGameState(`${player.name} の「時限爆弾」受け渡しは失敗しました… (不発)`);
            socket.emit('transferTimeBombResult', { success: false });
        }
    });

    socket.on('playCard', ({ instanceId, actionTarget, targetPlayerId, attackCount, chosenScore }) => {
        battle.resetScoreChanges(gameState);

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

        if (player.playedObanThisTurn) {
            socket.emit('errorMessage', '「お守り大判」を使用したため発動できません。');
            return;
        }
        if (player.playedDarkMatterThisTurn) {
            socket.emit('errorMessage', '「ダークマター」を使用したため発動できません。');
            return;
        }
        if ((card.id === 'omamori_oban' || card.id === 'dark_matter') && player.playedHandCardThisTurn) {
            socket.emit('errorMessage', '他のカードを使用したため発動できません。');
            return;
        }

        if (card.id === 'omamori_oban') {
            const addPoints = Math.min(Math.max(Number(chosenScore) || 8000, 3000), 8000);
            battle.applyScoreChange(player, addPoints);
            player.playedHandCardThisTurn = true;
            player.playedObanThisTurn = true;
            player.hand.splice(cardIndex, 1);
            broadcastGameState(`${player.name} が「お守り大判」を使用し、+${addPoints.toLocaleString()}点獲得しました！`);
            return;
        }

        if (card.id === 'dark_matter') {
            player.playedHandCardThisTurn = true;
            player.playedDarkMatterThisTurn = true;
            player.hand.splice(cardIndex, 1);
            if (player.timeBombTurns > 0) player.timeBombTurns = 0;
            if (player.darknessTurns > 0) player.darknessTurns = 0;
            battle.executeDarkMatter(gameState, socket.id, io, broadcastGameState, isImmuneToRound1CardEffect);
            return;
        }

        player.playedHandCardThisTurn = true;

        if (card.id === 'omamori_koban') {
            battle.applyScoreChange(player, 3000);
            player.hand.splice(cardIndex, 1);
            broadcastGameState(`${player.name} が「お守り小判」を使用し、+3,000点獲得しました！`);
        } else if (card.id === 'omamori_koban_set') {
            if (!card.usesLeft) card.usesLeft = 3;
            const count = Math.min(Math.max(Number(attackCount) || 1, 1), card.usesLeft);
            const addPoints = count * 2000;
            card.usesLeft -= count;
            battle.applyScoreChange(player, addPoints);

            let msg = `${player.name} が「お守り小判セット」を${count}回分使用し、+${addPoints.toLocaleString()}点獲得しました！`;
            if (card.usesLeft <= 0) {
                player.hand.splice(cardIndex, 1);
                msg += '（カード破棄）';
            }
            broadcastGameState(msg);
        } else if (card.id === 'disaster') {
            player.hand.splice(cardIndex, 1);
            gameState.cardCooldowns.disaster = 12;
            battle.executeDisasterAttack(gameState, socket.id, io, broadcastGameState, isImmuneToRound1CardEffect);
        } else if (card.id === 'diamond_sword') {
            player.hand.splice(cardIndex, 1);
            gameState.cardCooldowns.diamond_sword = 12;
            battle.executeDiamondSword(gameState, socket.id, io, broadcastGameState, isImmuneToRound1CardEffect);
        } else if (card.id === 'earthquake') {
            player.hand.splice(cardIndex, 1);
            gameState.cardCooldowns.earthquake = 12;
            battle.executeEarthquake(gameState, socket.id, io, broadcastGameState, isImmuneToRound1CardEffect);
        } else if (card.id === 'invincible_armor') {
            player.invincibleTurns = 4;
            player.invincibleSource = 'ARMOR';
            player.armorRevealed = false;
            if (player.timeBombTurns > 0) player.timeBombTurns = 0;
            if (player.darknessTurns > 0) player.darknessTurns = 0;
            player.hand.splice(cardIndex, 1);

            socket.emit('syncGameState', getSyncPayload(`「無敵アーマー」を使用しました。4ターンの間「無敵状態」になります。`));
            socket.broadcast.emit('syncGameState', getSyncPayload(''));
        } else if (card.id === 'steroid') {
            player.steroidTurns = 4;
            player.steroidRevealed = false;
            if (player.timeBombTurns > 0) player.timeBombTurns = 0;
            if (player.darknessTurns > 0) player.darknessTurns = 0;
            player.hand.splice(cardIndex, 1);

            socket.emit('syncGameState', getSyncPayload(`「ステロイド」を使用しました。4ターンの間「ステロイド状態」になります。`));
            socket.broadcast.emit('syncGameState', getSyncPayload(''));
        } else if (card.id === 'smoke_screen') {
            player.hand.splice(cardIndex, 1);
            gameState.cardCooldowns.smoke_screen = 12;
            battle.executeSmokeScreen(gameState, socket.id, io, broadcastGameState, isImmuneToRound1CardEffect);
        } else if (actionTarget === 'ATTACK') {
            if (!targetPlayerId) {
                socket.emit('errorMessage', '攻撃対象を選択してください。');
                return;
            }

            if (card.id === 'wood_shield' && (targetPlayerId === 'EQUAL_OR_HIGHER' || targetPlayerId === 'LOWER')) {
                player.hand.splice(cardIndex, 1);
                battle.executeWoodShieldGroupAttack(gameState, socket.id, targetPlayerId, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1);
            } else if (card.id === 'bronze_shield') {
                player.hand.splice(cardIndex, 1);
                if (targetPlayerId === 'CLOSEST_HIGHER') {
                    battle.executeBronzeShieldClosestAttack(gameState, socket.id, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1);
                } else if (targetPlayerId === 'LOWER') {
                    battle.executeBronzeShieldGroupAttack(gameState, socket.id, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1);
                }
            } else if (card.id === 'bronze_shield_set') {
                let cardObj = player.hand[cardIndex];
                if (!cardObj.usesLeft) cardObj.usesLeft = 3;
                const requestedCount = Math.min(Math.max(Number(attackCount) || 1, 1), 3);
                const maxAttacks = Math.min(requestedCount, cardObj.usesLeft);

                if (targetPlayerId === 'CLOSEST_HIGHER') {
                    battle.executeBronzeShieldSetAttack(gameState, socket.id, cardObj, maxAttacks, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, (finalLog) => {
                        if (cardObj.usesLeft <= 0) {
                            const idx = player.hand.findIndex(c => String(c.instanceId) === String(cardObj.instanceId));
                            if (idx !== -1) player.hand.splice(idx, 1);
                        }
                        broadcastGameState(finalLog || '');
                    });
                } else if (targetPlayerId === 'LOWER') {
                    battle.executeBronzeShieldSetGroupAttack(gameState, socket.id, cardObj, maxAttacks, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, (finalLog) => {
                        if (cardObj.usesLeft <= 0) {
                            const idx = player.hand.findIndex(c => String(c.instanceId) === String(cardObj.instanceId));
                            if (idx !== -1) player.hand.splice(idx, 1);
                        }
                        broadcastGameState(finalLog || '');
                    });
                }
            } else if (card.id === 'grenade') {
                player.hand.splice(cardIndex, 1);
                if (targetPlayerId === 'ALL_LOWER') {
                    battle.executeGrenadeGroupAttack(gameState, socket.id, io, broadcastGameState, isImmuneToRound1CardEffect, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1);
                } else {
                    battle.executeGrenadeSingleAttack(gameState, socket.id, targetPlayerId, io, broadcastGameState, isImmuneToRound1CardEffect, skipIfImmuneToRound1CardEffect, socket);
                }
            } else if (card.id === 'wood_shield_set' && (targetPlayerId === 'EQUAL_OR_HIGHER' || targetPlayerId === 'LOWER')) {
                let cardObj = player.hand[cardIndex];
                if (!cardObj.usesLeft) cardObj.usesLeft = 3;
                const requestedCount = Math.min(Math.max(Number(attackCount) || 1, 1), 3);
                const maxAttacks = Math.min(requestedCount, cardObj.usesLeft);

                battle.executeShieldSetGroupAttack(gameState, socket.id, targetPlayerId, cardObj, maxAttacks, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, (finalLog) => {
                    if (cardObj.usesLeft <= 0) {
                        const idx = player.hand.findIndex(c => String(c.instanceId) === String(cardObj.instanceId));
                        if (idx !== -1) player.hand.splice(idx, 1);
                    }
                    broadcastGameState(finalLog || '');
                });
            } else if (card.id === 'wood_sword_set') {
                let cardObj = player.hand[cardIndex];
                if (!cardObj.usesLeft) cardObj.usesLeft = 3;
                const requestedCount = Math.min(Math.max(Number(attackCount) || 1, 1), 3);
                const maxAttacks = Math.min(requestedCount, cardObj.usesLeft);

                if (targetPlayerId === 'ALL_LOWER') {
                    battle.executeWoodSwordSetGroupAttack(gameState, socket.id, cardObj, maxAttacks, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, (finalLog) => {
                        if (cardObj.usesLeft <= 0) {
                            const idx = player.hand.findIndex(c => String(c.instanceId) === String(cardObj.instanceId));
                            if (idx !== -1) player.hand.splice(idx, 1);
                        }
                        broadcastGameState(finalLog || '');
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

                    battle.executeWoodSwordSetAttack(gameState, socket.id, targetPlayerId, cardObj, maxAttacks, io, broadcastGameState, skipIfImmuneToRound1CardEffect, socket, (finalLog) => {
                        if (cardObj.usesLeft <= 0) {
                            const idx = player.hand.findIndex(c => String(c.instanceId) === String(cardObj.instanceId));
                            if (idx !== -1) player.hand.splice(idx, 1);
                        }
                        broadcastGameState(finalLog || '');
                    });
                }
            } else if (card.id === 'wood_sword') {
                if (targetPlayerId === 'ALL_LOWER') {
                    player.hand.splice(cardIndex, 1);
                    battle.executeWoodSwordAttack(gameState, socket.id, targetPlayerId, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, socket);
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
                    battle.executeWoodSwordAttack(gameState, socket.id, targetPlayerId, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, socket);
                }
            } else if (card.id === 'shotgun') {
                player.hand.splice(cardIndex, 1);
                battle.executeShotgunAttack(gameState, socket.id, targetPlayerId, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, socket);
            }
        } else if (actionTarget === 'DEFENSE') {
            if (player.defenseCard) {
                socket.emit('errorMessage', '防御カードはすでにセットされています。');
                return;
            }

            let uses = 1;
            if (card.id === 'wood_shield_set' || card.id === 'bronze_shield_set' || card.id === 'wood_sword_set') {
                if (!card.usesLeft) card.usesLeft = 3;
                uses = card.usesLeft;
            }

            player.defenseCard = { card, usesLeft: uses, revealed: false };
            player.playedHandCardThisTurn = true;
            player.hand.splice(cardIndex, 1);

            if (showOtherPlayersInfo) {
                broadcastGameState(`${player.name} が防御カード「${card.name}」をセットしました。`);
            } else {
                socket.emit('syncGameState', getSyncPayload(`防御カード「${card.name}」をセットしました。`));
                socket.broadcast.emit('syncGameState', getSyncPayload(''));
            }
        }
    });

    socket.on('playDefenseAsAttack', ({ targetPlayerId, attackCount }) => {
        battle.resetScoreChanges(gameState);
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
            battle.executeWoodShieldGroupAttack(gameState, socket.id, targetPlayerId, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1);
            return;
        }

        if (card.id === 'bronze_shield') {
            player.defenseCard = null;
            if (targetPlayerId === 'CLOSEST_HIGHER') {
                battle.executeBronzeShieldClosestAttack(gameState, socket.id, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1);
            } else if (targetPlayerId === 'LOWER') {
                battle.executeBronzeShieldGroupAttack(gameState, socket.id, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1);
            }
            return;
        }

        if (card.id === 'bronze_shield_set') {
            const requestedCount = Math.min(Math.max(Number(attackCount) || 1, 1), 3);
            const maxAttacks = Math.min(requestedCount, defObj.usesLeft);

            if (targetPlayerId === 'CLOSEST_HIGHER') {
                battle.executeBronzeShieldSetAttack(gameState, socket.id, defObj, maxAttacks, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, (finalLog) => {
                    card.usesLeft = defObj.usesLeft;
                    if (defObj.usesLeft <= 0) player.defenseCard = null;
                    broadcastGameState(finalLog || '');
                });
                return;
            } else if (targetPlayerId === 'LOWER') {
                battle.executeBronzeShieldSetGroupAttack(gameState, socket.id, defObj, maxAttacks, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, (finalLog) => {
                    card.usesLeft = defObj.usesLeft;
                    if (defObj.usesLeft <= 0) player.defenseCard = null;
                    broadcastGameState(finalLog || '');
                });
                return;
            }
        }

        if (card.id === 'grenade') {
            player.defenseCard = null;
            if (targetPlayerId === 'ALL_LOWER') {
                battle.executeGrenadeGroupAttack(gameState, socket.id, io, broadcastGameState, isImmuneToRound1CardEffect, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1);
            } else {
                battle.executeGrenadeSingleAttack(gameState, socket.id, targetPlayerId, io, broadcastGameState, isImmuneToRound1CardEffect, skipIfImmuneToRound1CardEffect, socket);
            }
            return;
        }

        if (card.id === 'wood_shield_set' && (targetPlayerId === 'EQUAL_OR_HIGHER' || targetPlayerId === 'LOWER')) {
            const requestedCount = Math.min(Math.max(Number(attackCount) || 1, 1), 3);
            const maxAttacks = Math.min(requestedCount, defObj.usesLeft);

            battle.executeShieldSetGroupAttack(gameState, socket.id, targetPlayerId, defObj, maxAttacks, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, (finalLog) => {
                card.usesLeft = defObj.usesLeft;
                if (defObj.usesLeft <= 0) player.defenseCard = null;
                broadcastGameState(finalLog || '');
            });
            return;
        }

        if (card.id === 'wood_sword_set') {
            const requestedCount = Math.min(Math.max(Number(attackCount) || 1, 1), 3);
            const maxAttacks = Math.min(requestedCount, defObj.usesLeft);

            if (targetPlayerId === 'ALL_LOWER') {
                battle.executeWoodSwordSetGroupAttack(gameState, socket.id, defObj, maxAttacks, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, (finalLog) => {
                    card.usesLeft = defObj.usesLeft;
                    if (defObj.usesLeft <= 0) player.defenseCard = null;
                    broadcastGameState(finalLog || '');
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

                battle.executeWoodSwordSetAttack(gameState, socket.id, targetPlayerId, defObj, maxAttacks, io, broadcastGameState, skipIfImmuneToRound1CardEffect, socket, (finalLog) => {
                    card.usesLeft = defObj.usesLeft;
                    if (defObj.usesLeft <= 0) player.defenseCard = null;
                    broadcastGameState(finalLog || '');
                });
                return;
            }
        }

        if (card.id === 'wood_sword') {
            if (targetPlayerId === 'ALL_LOWER') {
                player.defenseCard = null;
                battle.executeWoodSwordAttack(gameState, socket.id, targetPlayerId, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, socket);
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
                battle.executeWoodSwordAttack(gameState, socket.id, targetPlayerId, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, socket);
                return;
            }
        }
    });

    socket.on('discardDefense', () => {
        const currentTurnId = gameState.currentTurnPlayerId;
        if (socket.id !== currentTurnId || gameState.turnPhase !== 'MAIN') return;
        const player = gameState.players[socket.id];
        if (player.defenseCard) {
            player.defenseCard = null;
            broadcastGameState(`${player.name} がセット中の防御カードを破棄しました。`);
        }
    });

    socket.on('endTurn', () => {
        battle.resetScoreChanges(gameState);
        const currentTurnId = gameState.currentTurnPlayerId;
        if (socket.id !== currentTurnId) return;

        const player = gameState.players[socket.id];
        if (player.hand.length >= 2) {
            gameState.turnPhase = 'DISCARD';
            socket.emit('mustDiscard', { currentCount: player.hand.length });
            broadcastGameState(`${player.name} は手札削減中...`);
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
                broadcastGameState(`${player.name} が「${removed.name}」を捨てました。`);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('切断:', socket.id);
        const wasJoined = !!gameState.players[socket.id];

        if (!gameState.started && wasJoined) {
            delete gameState.players[socket.id];
            const newCount = Object.keys(gameState.players).length;
            io.emit('playerUpdate', { playerCount: newCount, started: false });
        }

        delete socketProfiles[socket.id];

        if (Object.keys(gameState.players).length === 0 && gameState.started) {
            if (gameState.draft.timer) clearTimeout(gameState.draft.timer);
            gameState = createInitialState();
            console.log('全員切断のためリセット');
        }
    });
});

server.listen(3000, () => {
    console.log('サーバーがポート 3000 で起動しました');
});