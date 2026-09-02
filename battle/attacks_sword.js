/**
 * 剣系攻撃カード実行モジュール (battle/attacks_sword.js)
 * 木の剣・木の剣セット・標準攻撃処理
 */

const {
    applyScoreChange,
    isDefenseBlocked,
    getWoodShieldHitRate
} = require('./common');

const { tryAutoTriggerDefense } = require('./triggers');
const { executeGrenadeDefenseCounter } = require('./attacks_gun');

/**
 * 木の剣（単体・グループ：カットイン完全同期）
 */
function executeWoodSwordAttack(gameState, attackerId, targetTypeOrId, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, socket) {
    const attacker = gameState.players[attackerId];
    if (!attacker) return;

    if (targetTypeOrId === 'ALL_LOWER') {
        const currentPlayers = Object.values(gameState.players);
        const currentAttackerScore = attacker.score;

        const lowerPlayers = currentPlayers.filter(p =>
            p.score < currentAttackerScore &&
            (!p.immunityCount || p.immunityCount <= 0) &&
            !cannotSelectAsAttackTargetInRound1(attackerId, p.id)
        );

        if (lowerPlayers.length === 0) {
            broadcastGameState(`${attacker.name} が「木の剣」を使用しましたが、対象となる下位プレイヤーがいませんでした。`);
            return;
        }

        const grouped = {};
        lowerPlayers.forEach(p => {
            const diff = currentAttackerScore - p.score;
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

        const defendersList = attackQueue.map(p => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar ? `/images/avatars/${p.avatar}.png` : '/images/avatars/avatar_default.png'
        }));

        let finalLog = '';
        let stoppedEarly = false;
        let baseHitRate = 0.5;
        if (attacker.darknessTurns && attacker.darknessTurns > 0) baseHitRate = 0.25;

        const cutinResults = [];
        let pendingDarkMatterCutin = null;

        for (let i = 0; i < attackQueue.length; i++) {
            if (stoppedEarly) break;

            const target = gameState.players[attackQueue[i].id];
            if (!target) continue;

            const isHit = Math.random() < baseHitRate;

            if (!isHit) {
                cutinResults.push({ targetId: target.id, result: 'MISS' });
                continue;
            }

            if (target.defenseCard && !isDefenseBlocked(target, attacker)) {
                const defImg = target.defenseCard.card.image || '/images/wood_shield.png';
                target.defenseCard.usesLeft -= 1;
                target.defenseCard.revealed = true;
                let msg = `${attacker.name} の「木の剣」攻撃！ しかし ${target.name} の防御カード「${target.defenseCard.card.name}」で無効化されました！（攻撃終了）`;
                if (target.defenseCard.card.id === 'grenade') {
                    executeGrenadeDefenseCounter(gameState, target.id, broadcastGameState);
                }
                if (target.defenseCard && target.defenseCard.usesLeft <= 0) {
                    target.defenseCard = null;
                    msg += '（相手の防御カード破棄）';
                }
                finalLog = msg;
                cutinResults.push({ targetId: target.id, result: 'BLOCK', defCardImage: defImg });
                stoppedEarly = true;
                break;
            }

            const autoRes = tryAutoTriggerDefense(gameState, target, {
                allowSteroid: true,
                isImmuneToRound1CardEffect: skipIfImmuneToRound1CardEffect,
                broadcastGameState: broadcastGameState
            });

            if (autoRes) {
                cutinResults.push({ targetId: target.id, result: autoRes.cardId === 'steroid' ? 'STEROID' : 'INVINCIBLE' });
                finalLog = `${attacker.name} の「木の剣」攻撃！ しかし ${target.name} の手札から「${autoRes.cardName}」が自動発動！攻撃が無効化されました！（攻撃終了）\n(${autoRes.logMsg})`;
                if (autoRes.darkMatterCutinData) {
                    pendingDarkMatterCutin = autoRes.darkMatterCutinData;
                }
                stoppedEarly = true;
                break;
            }

            if (target.steroidTurns && target.steroidTurns > 0) {
                target.steroidRevealed = true;
                finalLog = `${attacker.name} の「木の剣」攻撃！ しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！（攻撃終了）`;
                cutinResults.push({ targetId: target.id, result: 'STEROID' });
                stoppedEarly = true;
                break;
            }

            if (target.invincibleTurns && target.invincibleTurns > 0) {
                if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
                finalLog = `${attacker.name} の「木の剣」攻撃！ しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！（攻撃終了）`;
                cutinResults.push({ targetId: target.id, result: 'INVINCIBLE' });
                stoppedEarly = true;
                break;
            }

            let blockedNotice = (target.defenseCard && isDefenseBlocked(target, attacker)) ? ` (セット中「${target.defenseCard.card.name}」は格上攻撃のため貫通！)` : '';
            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            finalLog = `${attacker.name} の「木の剣」攻撃 (対象: ${target.name})！ 命中ヒット！${blockedNotice} 得点-3,000点！ (${target.name}は選択不可状態になりました。攻撃終了)`;
            cutinResults.push({ targetId: target.id, result: 'HIT' });
            stoppedEarly = true;
            break;
        }

        if (!finalLog) {
            finalLog = `${attacker.name} の「木の剣」攻撃は誰にも命中・無効化されず終了しました。`;
        }

        if (io) {
            // 1. 元の攻撃カットイン
            io.emit('playAttackCutin', {
                attacker: {
                    id: attacker.id,
                    name: attacker.name,
                    avatar: attacker.avatar ? `/images/avatars/${attacker.avatar}.png` : '/images/avatars/avatar_default.png'
                },
                card: {
                    id: 'wood_sword',
                    name: '木の剣',
                    image: '/images/wood_sword.png'
                },
                defenders: defendersList,
                results: cutinResults
            });

            // 2. 自動発動したダークマターのカットイン
            if (pendingDarkMatterCutin) {
                io.emit('playAttackCutin', pendingDarkMatterCutin);
            }
        }

        const baseDuration = Math.max(1200, cutinResults.length * 600 + 800);
        const animDuration = pendingDarkMatterCutin ? (baseDuration + 1400) : baseDuration;
        setTimeout(() => {
            broadcastGameState(finalLog);
        }, animDuration);
        return;
    }

    // 単体指定
    const target = gameState.players[targetTypeOrId];
    if (!target) return;

    if (skipIfImmuneToRound1CardEffect(target, attacker, '「木の剣」攻撃')) return;

    const scoreDiff = target.score - attacker.score;
    if (scoreDiff < 0 || scoreDiff > 5000) {
        if (socket) socket.emit('errorMessage', '自分との得点差が0点以上+5,000点以下のプレイヤーのみ攻撃対象に指定できます。');
        return;
    }

    let baseHitRate = 0.5;
    if (attacker.darknessTurns && attacker.darknessTurns > 0) baseHitRate = 0.25;
    let logPrefix = `${attacker.name} が ${target.name} に「木の剣」で攻撃！ `;
    const isHit = Math.random() < baseHitRate;

    let cutinRes = 'HIT';
    let defImg = null;
    let finalLog = '';
    let pendingDarkMatterCutin = null;

    if (!isHit) {
        cutinRes = 'MISS';
        finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 攻撃は外れた！（ミス）`;
    } else if (target.defenseCard && !isDefenseBlocked(target, attacker)) {
        target.defenseCard.usesLeft -= 1;
        target.defenseCard.revealed = true;
        defImg = target.defenseCard.card.image || '/images/wood_shield.png';
        let msg = logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
        if (target.defenseCard.card.id === 'grenade') {
            executeGrenadeDefenseCounter(gameState, target.id, broadcastGameState);
        }
        if (target.defenseCard && target.defenseCard.usesLeft <= 0) {
            target.defenseCard = null;
            msg += '（相手の防御カード破棄）';
        }
        finalLog = msg;
        cutinRes = 'BLOCK';
    } else {
        const autoRes = tryAutoTriggerDefense(gameState, target, {
            allowSteroid: true,
            isImmuneToRound1CardEffect: skipIfImmuneToRound1CardEffect,
            broadcastGameState: broadcastGameState
        });

        if (autoRes) {
            cutinRes = autoRes.cardId === 'steroid' ? 'STEROID' : 'INVINCIBLE';
            finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし ${target.name} の手札から「${autoRes.cardName}」が自動発動！攻撃が無効化されました！\n(${autoRes.logMsg})`;
            if (autoRes.darkMatterCutinData) {
                pendingDarkMatterCutin = autoRes.darkMatterCutinData;
            }
        } else if (target.invincibleTurns && target.invincibleTurns > 0) {
            if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！`;
            cutinRes = 'INVINCIBLE';
        } else if (target.steroidTurns && target.steroidTurns > 0) {
            target.steroidRevealed = true;
            finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！`;
            cutinRes = 'STEROID';
        } else {
            let blockedNotice = (target.defenseCard && isDefenseBlocked(target, attacker)) ? ` 相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！` : '';
            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 命中ヒット！${blockedNotice} 得点-3,000点！ (${target.name}は選択不可状態になりました)`;
            cutinRes = 'HIT';
        }
    }

    if (io) {
        // 1. 元の攻撃カットイン
        io.emit('playAttackCutin', {
            attacker: {
                id: attacker.id,
                name: attacker.name,
                avatar: attacker.avatar ? `/images/avatars/${attacker.avatar}.png` : '/images/avatars/avatar_default.png'
            },
            card: {
                id: 'wood_sword',
                name: '木の剣',
                image: '/images/wood_sword.png'
            },
            defenders: [{
                id: target.id,
                name: target.name,
                avatar: target.avatar ? `/images/avatars/${target.avatar}.png` : '/images/avatars/avatar_default.png'
            }],
            results: [{ targetId: target.id, result: cutinRes, defCardImage: defImg }]
        });

        // 2. 自動発動したダークマターのカットイン
        if (pendingDarkMatterCutin) {
            io.emit('playAttackCutin', pendingDarkMatterCutin);
        }
    }

    const duration = pendingDarkMatterCutin ? 2800 : 1400;
    setTimeout(() => {
        broadcastGameState(finalLog);
    }, duration);
}

/**
 * 木の剣セット（単体連撃：カットイン完全同期）
 */
function executeWoodSwordSetAttack(gameState, attackerId, targetId, cardObj, maxAttacks, io, broadcastGameState, skipIfImmuneToRound1CardEffect, socket, onComplete) {
    const attacker = gameState.players[attackerId];
    const target = gameState.players[targetId];

    if (!attacker || !target) { onComplete(); return; }
    if (skipIfImmuneToRound1CardEffect(target, attacker, '「木の剣セット」攻撃')) { onComplete(); return; }

    const scoreDiff = target.score - attacker.score;
    if (scoreDiff < 0 || scoreDiff > 5000) {
        if (socket) socket.emit('errorMessage', '自分との得点差が0点以上+5,000点以下のプレイヤーのみ攻撃対象に指定できます。');
        onComplete();
        return;
    }

    let baseHitRate = 0.5;
    if (attacker.darknessTurns && attacker.darknessTurns > 0) baseHitRate = 0.25;

    const rounds = [];
    const logs = [];
    let actualAttacksDone = 0;
    let pendingDarkMatterCutin = null;

    for (let r = 0; r < maxAttacks; r++) {
        if (cardObj.usesLeft <= 0) break;

        actualAttacksDone++;
        cardObj.usesLeft -= 1;

        let logPrefix = `${attacker.name} が ${target.name} に「木の剣セット」で攻撃 (${actualAttacksDone}/${maxAttacks}回目)！ `;
        const isHit = Math.random() < baseHitRate;

        if (!isHit) {
            logs.push(logPrefix + `(成功率:${baseHitRate * 100}%) 攻撃は外れた！（ミス）`);
            rounds.push({
                roundNumber: actualAttacksDone,
                results: [{ targetId: target.id, result: 'MISS' }]
            });
            continue;
        }

        let cutinRes = 'HIT';
        let defImg = null;

        if (target.defenseCard && !isDefenseBlocked(target, attacker)) {
            target.defenseCard.usesLeft -= 1;
            target.defenseCard.revealed = true;
            defImg = target.defenseCard.card.image || '/images/wood_shield.png';
            let msg = logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
            if (target.defenseCard.card.id === 'grenade') {
                executeGrenadeDefenseCounter(gameState, target.id, broadcastGameState);
            }
            if (target.defenseCard && target.defenseCard.usesLeft <= 0) {
                target.defenseCard = null;
                msg += '（相手の防御カード破棄）';
            }
            logs.push(msg);
            cutinRes = 'BLOCK';
            rounds.push({
                roundNumber: actualAttacksDone,
                results: [{ targetId: target.id, result: cutinRes, defCardImage: defImg }]
            });
            continue;
        } else {
            const autoRes = tryAutoTriggerDefense(gameState, target, {
                allowSteroid: true,
                isImmuneToRound1CardEffect: skipIfImmuneToRound1CardEffect,
                broadcastGameState: broadcastGameState
            });

            if (autoRes) {
                cutinRes = autoRes.cardId === 'steroid' ? 'STEROID' : 'INVINCIBLE';
                logs.push(logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし ${target.name} の手札から「${autoRes.cardName}」が自動発動！攻撃が無効化されました！（連撃中断）\n(${autoRes.logMsg})`);
                if (autoRes.darkMatterCutinData) {
                    pendingDarkMatterCutin = autoRes.darkMatterCutinData;
                }
                rounds.push({
                    roundNumber: actualAttacksDone,
                    results: [{ targetId: target.id, result: cutinRes }]
                });
                break;
            }

            if (target.invincibleTurns && target.invincibleTurns > 0) {
                if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
                logs.push(logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！（連撃中断）`);
                cutinRes = 'INVINCIBLE';
                rounds.push({
                    roundNumber: actualAttacksDone,
                    results: [{ targetId: target.id, result: cutinRes }]
                });
                break;
            }

            if (target.steroidTurns && target.steroidTurns > 0) {
                target.steroidRevealed = true;
                logs.push(logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！（連撃中断）`);
                cutinRes = 'STEROID';
                rounds.push({
                    roundNumber: actualAttacksDone,
                    results: [{ targetId: target.id, result: cutinRes }]
                });
                break;
            }

            let blockedNotice = (target.defenseCard && isDefenseBlocked(target, attacker)) ? ` 相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！` : '';
            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            logs.push(logPrefix + `(成功率:${baseHitRate * 100}%) 命中ヒット！${blockedNotice} 得点-3,000点！ (${target.name}は選択不可状態になりました。連撃終了)`);
            cutinRes = 'HIT';
            rounds.push({
                roundNumber: actualAttacksDone,
                results: [{ targetId: target.id, result: cutinRes }]
            });
            break;
        }
    }

    if (io) {
        // 1. 元の連撃カットイン
        io.emit('playAttackCutin', {
            attacker: {
                id: attacker.id,
                name: attacker.name,
                avatar: attacker.avatar ? `/images/avatars/${attacker.avatar}.png` : '/images/avatars/avatar_default.png'
            },
            card: {
                id: 'wood_sword_set',
                name: '木の剣セット',
                image: '/images/wood_sword_set.png'
            },
            defenders: [{
                id: target.id,
                name: target.name,
                avatar: target.avatar ? `/images/avatars/${target.avatar}.png` : '/images/avatars/avatar_default.png'
            }],
            rounds: rounds
        });

        // 2. 自動発動したダークマターのカットイン
        if (pendingDarkMatterCutin) {
            io.emit('playAttackCutin', pendingDarkMatterCutin);
        }
    }

    const baseDuration = Math.max(1500, rounds.length * 1300 + 600);
    const totalDuration = pendingDarkMatterCutin ? (baseDuration + 1400) : baseDuration;
    setTimeout(() => {
        if (logs.length > 0) {
            broadcastGameState(logs.join('\n'));
        }
        onComplete();
    }, totalDuration);
}

/**
 * 木の剣セット（グループ連撃：カットイン完全同期）
 */
function executeWoodSwordSetGroupAttack(gameState, attackerId, cardObj, maxAttacks, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, onComplete) {
    const attacker = gameState.players[attackerId];
    if (!attacker) { onComplete(); return; }

    const myScore = attacker.score;
    const initialCandidates = Object.values(gameState.players).filter(p => {
        if (p.id === attackerId || (p.immunityCount && p.immunityCount > 0) || cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
        return p.score < myScore;
    });

    if (initialCandidates.length === 0) {
        broadcastGameState(`${attacker.name} が「木の剣セット」で攻撃を開始しましたが、対象となる下位プレイヤーがいませんでした。`);
        onComplete();
        return;
    }

    const initGrouped = {};
    initialCandidates.forEach(p => {
        const diff = Math.abs(myScore - p.score);
        if (!initGrouped[diff]) initGrouped[diff] = [];
        initGrouped[diff].push(p);
    });

    const initSortedDiffs = Object.keys(initGrouped).map(Number).sort((a, b) => a - b);
    const sortedInitList = [];
    initSortedDiffs.forEach(diff => {
        sortedInitList.push(...initGrouped[diff]);
    });

    const defendersList = sortedInitList.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar ? `/images/avatars/${p.avatar}.png` : '/images/avatars/avatar_default.png'
    }));

    const rounds = [];
    const logs = [];
    let stoppedByInvincible = false;
    let actualAttacksDone = 0;
    let baseHitRate = 0.5;
    if (attacker.darknessTurns && attacker.darknessTurns > 0) baseHitRate = 0.25;
    let pendingDarkMatterCutin = null;

    for (let r = 0; r < maxAttacks; r++) {
        if (cardObj.usesLeft <= 0 || stoppedByInvincible) break;

        const roundCandidates = Object.values(gameState.players).filter(p => {
            if (p.id === attackerId || (p.immunityCount && p.immunityCount > 0) || cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
            return p.score < myScore;
        });

        if (roundCandidates.length === 0) break;

        const grouped = {};
        roundCandidates.forEach(p => {
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

        actualAttacksDone++;
        cardObj.usesLeft -= 1;

        const currentRoundResults = [];
        let hitInThisRound = false;

        for (let i = 0; i < attackQueue.length; i++) {
            if (hitInThisRound) break;

            const target = gameState.players[attackQueue[i].id];
            if (!target) continue;

            const isHit = Math.random() < baseHitRate;

            if (!isHit) {
                currentRoundResults.push({ targetId: target.id, result: 'MISS' });
                continue;
            }

            if (target.defenseCard && !isDefenseBlocked(target, attacker)) {
                const defImg = target.defenseCard.card.image || '/images/wood_shield.png';
                target.defenseCard.usesLeft -= 1;
                target.defenseCard.revealed = true;
                let msg = `${attacker.name} の「木の剣セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目)！ しかし ${target.name} の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
                if (target.defenseCard.card.id === 'grenade') {
                    executeGrenadeDefenseCounter(gameState, target.id, broadcastGameState);
                }
                if (target.defenseCard && target.defenseCard.usesLeft <= 0) {
                    target.defenseCard = null;
                    msg += '（相手の防御カード破棄）';
                }
                logs.push(msg);
                currentRoundResults.push({ targetId: target.id, result: 'BLOCK', defCardImage: defImg });
                hitInThisRound = true;
                break;
            }

            const autoRes = tryAutoTriggerDefense(gameState, target, {
                allowSteroid: true,
                isImmuneToRound1CardEffect: skipIfImmuneToRound1CardEffect,
                broadcastGameState: broadcastGameState
            });

            if (autoRes) {
                currentRoundResults.push({ targetId: target.id, result: autoRes.cardId === 'steroid' ? 'STEROID' : 'INVINCIBLE' });
                logs.push(`${attacker.name} の「木の剣セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目)！ しかし ${target.name} の手札から「${autoRes.cardName}」が自動発動！攻撃が無効化されました！（連撃中断）\n(${autoRes.logMsg})`);
                if (autoRes.darkMatterCutinData) {
                    pendingDarkMatterCutin = autoRes.darkMatterCutinData;
                }
                stoppedByInvincible = true;
                hitInThisRound = true;
                break;
            }

            if (target.steroidTurns && target.steroidTurns > 0) {
                target.steroidRevealed = true;
                logs.push(`${attacker.name} の「木の剣セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目)！ しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！（連撃中断）`);
                currentRoundResults.push({ targetId: target.id, result: 'STEROID' });
                stoppedByInvincible = true;
                hitInThisRound = true;
                break;
            }

            if (target.invincibleTurns && target.invincibleTurns > 0) {
                if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
                logs.push(`${attacker.name} の「木の剣セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目)！ しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！（連撃中断）`);
                currentRoundResults.push({ targetId: target.id, result: 'INVINCIBLE' });
                stoppedByInvincible = true;
                hitInThisRound = true;
                break;
            }

            let blockedNotice = (target.defenseCard && isDefenseBlocked(target, attacker)) ? ` (セット中「${target.defenseCard.card.name}」は格上攻撃のため貫通！)` : '';
            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            logs.push(`${attacker.name} の「木の剣セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目, 対象: ${target.name})！ 命中ヒット！${blockedNotice} 得点-3,000点！ (${target.name}は選択不可状態になりました)`);
            currentRoundResults.push({ targetId: target.id, result: 'HIT' });
            hitInThisRound = true;
            break;
        }

        if (!hitInThisRound) {
            logs.push(`${attacker.name} の「木の剣セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目) は全員に外れました。`);
        }

        rounds.push({
            roundNumber: actualAttacksDone,
            results: currentRoundResults
        });
    }

    if (io) {
        // 1. 元の連撃カットイン
        io.emit('playAttackCutin', {
            attacker: {
                id: attacker.id,
                name: attacker.name,
                avatar: attacker.avatar ? `/images/avatars/${attacker.avatar}.png` : '/images/avatars/avatar_default.png'
            },
            card: {
                id: 'wood_sword_set',
                name: '木の剣セット',
                image: '/images/wood_sword_set.png'
            },
            defenders: defendersList,
            rounds: rounds
        });

        // 2. 自動発動したダークマターのカットイン
        if (pendingDarkMatterCutin) {
            io.emit('playAttackCutin', pendingDarkMatterCutin);
        }
    }

    const baseDuration = Math.max(1500, rounds.length * 1300 + 600);
    const totalDuration = pendingDarkMatterCutin ? (baseDuration + 1400) : baseDuration;
    setTimeout(() => {
        if (logs.length > 0) {
            broadcastGameState(logs.join('\n'));
        }
        onComplete();
    }, totalDuration);
}

// 標準攻撃（木の盾 / 木の剣 単体）
function executeStandardAttack(gameState, attackerId, targetId, cardId, io, broadcastGameState, skipIfImmuneToRound1CardEffect) {
    const attacker = gameState.players[attackerId];
    const target = gameState.players[targetId];

    if (skipIfImmuneToRound1CardEffect(target, attacker, '攻撃')) return;

    const cardName = cardId === 'wood_sword' ? '木の剣' : '木の盾';
    let logPrefix = `${attacker.name} が ${target.name} に「${cardName}」で攻撃！ `;

    let hitRate = 0.5;
    if (cardId === 'wood_shield') hitRate = getWoodShieldHitRate(attacker.score, target.score);
    if (attacker.darknessTurns && attacker.darknessTurns > 0) hitRate = hitRate * 0.5;

    if (hitRate <= 0) return;

    let isHit = Math.random() < hitRate;
    let ratePercent = Math.round(hitRate * 100);
    let rateText = `(命中率:${ratePercent}%) `;

    let cutinRes = 'MISS';
    let defImg = null;
    let autoTriggerRes = null;
    let pendingDarkMatterCutin = null;

    if (isHit) {
        if (target.defenseCard && !isDefenseBlocked(target, attacker)) {
            cutinRes = 'BLOCK';
            defImg = target.defenseCard.card.image || `/images/${cardId}.png`;
        } else {
            autoTriggerRes = tryAutoTriggerDefense(gameState, target, {
                allowSteroid: true,
                isImmuneToRound1CardEffect: skipIfImmuneToRound1CardEffect,
                broadcastGameState: broadcastGameState
            });

            if (autoTriggerRes) {
                cutinRes = autoTriggerRes.cardId === 'steroid' ? 'STEROID' : 'INVINCIBLE';
                if (autoTriggerRes.darkMatterCutinData) {
                    pendingDarkMatterCutin = autoTriggerRes.darkMatterCutinData;
                }
            } else if (target.invincibleTurns && target.invincibleTurns > 0) {
                cutinRes = 'INVINCIBLE';
            } else if (target.steroidTurns && target.steroidTurns > 0) {
                cutinRes = 'STEROID';
            } else {
                cutinRes = 'HIT';
            }
        }
    }

    if (io) {
        // 1. 元の攻撃カットイン
        io.emit('playAttackCutin', {
            attacker: {
                id: attacker.id,
                name: attacker.name,
                avatar: attacker.avatar ? `/images/avatars/${attacker.avatar}.png` : '/images/avatars/avatar_default.png'
            },
            card: {
                id: cardId,
                name: cardName,
                image: `/images/${cardId}.png`
            },
            defenders: [{
                id: target.id,
                name: target.name,
                avatar: target.avatar ? `/images/avatars/${target.avatar}.png` : '/images/avatars/avatar_default.png'
            }],
            results: [{ targetId: target.id, result: cutinRes, defCardImage: defImg }]
        });

        // 2. 自動発動したダークマターのカットイン
        if (pendingDarkMatterCutin) {
            io.emit('playAttackCutin', pendingDarkMatterCutin);
        }
    }

    function finalizeStandardAttack() {
        if (!isHit) {
            broadcastGameState(logPrefix + rateText + `攻撃は外れた！（ミス）`);
            return;
        }

        if (target.defenseCard && !isDefenseBlocked(target, attacker)) {
            target.defenseCard.usesLeft -= 1;
            target.defenseCard.revealed = true;
            let msg = logPrefix + rateText + `命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
            if (target.defenseCard.card.id === 'grenade') {
                executeGrenadeDefenseCounter(gameState, target.id, broadcastGameState);
            }
            if (target.defenseCard && target.defenseCard.usesLeft <= 0) {
                target.defenseCard = null;
                msg += '（相手の防御カード破棄）';
            }
            broadcastGameState(msg);
            return;
        }

        if (autoTriggerRes) {
            broadcastGameState(logPrefix + rateText + `命中！しかし ${target.name} の手札から「${autoTriggerRes.cardName}」が自動発動！攻撃が無効化されました！\n(${autoTriggerRes.logMsg})`);
            return;
        }

        if (target.invincibleTurns && target.invincibleTurns > 0) {
            if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            broadcastGameState(logPrefix + rateText + `命中！しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！`);
            return;
        }

        if (target.steroidTurns && target.steroidTurns > 0) {
            target.steroidRevealed = true;
            broadcastGameState(logPrefix + rateText + `命中！しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！`);
            return;
        }

        let blockedNotice = (target.defenseCard && isDefenseBlocked(target, attacker)) ? ` 命中！相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！` : ' 命中ヒット！';
        applyScoreChange(target, -3000);
        target.immunityCount = 2;
        broadcastGameState(logPrefix + rateText + `${blockedNotice} 得点-3,000点！ (${target.name}は選択不可状態になりました)`);
    }

    const duration = pendingDarkMatterCutin ? 2800 : 1400;
    setTimeout(finalizeStandardAttack, duration);
}

module.exports = {
    executeWoodSwordAttack,
    executeWoodSwordSetAttack,
    executeWoodSwordSetGroupAttack,
    executeStandardAttack
};