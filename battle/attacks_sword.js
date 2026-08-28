/**
 * 剣系攻撃カード実行モジュール (battle/attacks_sword.js)
 * 木の剣・木の剣セット・標準攻撃処理
 */

const {
    applyScoreChange,
    isDefenseBlocked,
    getWoodShieldHitRate
} = require('./common');

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

        // 攻撃順（キュー順）通りのディフェンダー配列
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

        for (let i = 0; i < attackQueue.length; i++) {
            if (stoppedEarly) break;

            const target = gameState.players[attackQueue[i].id];
            if (!target) continue;

            const isHit = Math.random() < baseHitRate;

            if (!isHit) {
                cutinResults.push({ targetId: target.id, result: 'MISS' });
                continue;
            }

            if (target.defenseCard) {
                if (isDefenseBlocked(target, attacker)) {
                    // 貫通
                } else {
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

            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            finalLog = `${attacker.name} の「木の剣」攻撃 (対象: ${target.name})！ 命中ヒット！ 得点-3,000点！ (${target.name}は選択不可状態になりました。攻撃終了)`;
            cutinResults.push({ targetId: target.id, result: 'HIT' });
            stoppedEarly = true;
            break;
        }

        if (!finalLog) {
            finalLog = `${attacker.name} の「木の剣」攻撃は誰にも命中・無効化されず終了しました。`;
        }

        if (io) {
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
        }

        const animDuration = Math.max(1200, cutinResults.length * 600 + 800);
        setTimeout(() => {
            broadcastGameState(finalLog);
        }, animDuration);
        return;
    }

    // 単体指定
    const target = gameState.players[targetTypeOrId];
    if (!target) return;

    if (skipIfImmuneToRound1CardEffect(target, attacker, '「木の剣」攻撃')) return;

    const isSteroid = target.steroidTurns && target.steroidTurns > 0;
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

    if (!isHit) {
        cutinRes = 'MISS';
        finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 攻撃は外れた！（ミス）`;
    } else if (target.defenseCard) {
        if (isDefenseBlocked(target, attacker)) {
            finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 命中！相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！`;
            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            finalLog += ` 得点-3,000点！ (${target.name}は選択不可状態になりました)`;
            cutinRes = 'HIT';
        } else {
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
        }
    } else if (target.invincibleTurns && target.invincibleTurns > 0) {
        if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
        finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！`;
        cutinRes = 'INVINCIBLE';
    } else if (isSteroid) {
        target.steroidRevealed = true;
        finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！`;
        cutinRes = 'STEROID';
    } else {
        applyScoreChange(target, -3000);
        target.immunityCount = 2;
        finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 命中ヒット！ 得点-3,000点！ (${target.name}は選択不可状態になりました)`;
        cutinRes = 'HIT';
    }

    if (io) {
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
    }

    setTimeout(() => {
        broadcastGameState(finalLog);
    }, 1400);
}

// 木の剣セット（単体連撃）
function executeWoodSwordSetAttack(gameState, attackerId, targetId, cardObj, maxAttacks, broadcastGameState, skipIfImmuneToRound1CardEffect, socket, onComplete) {
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

    let attackIndex = 0;

    function doNextAttack() {
        if (attackIndex >= maxAttacks || cardObj.usesLeft <= 0) {
            onComplete();
            return;
        }

        attackIndex++;
        cardObj.usesLeft -= 1;

        let baseHitRate = 0.5;
        if (attacker.darknessTurns && attacker.darknessTurns > 0) baseHitRate = 0.25;

        let logPrefix = `${attacker.name} が ${target.name} に「木の剣セット」で攻撃 (${attackIndex}/${maxAttacks}回目)！ `;
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
                target.defenseCard.revealed = true;
                let msg = logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
                if (target.defenseCard.card.id === 'grenade') {
                    executeGrenadeDefenseCounter(gameState, target.id, broadcastGameState);
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
            broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！（攻撃中断）`);
            onComplete();
            return;
        }

        if (target.steroidTurns && target.steroidTurns > 0) {
            target.steroidRevealed = true;
            broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！（攻撃中断）`);
            onComplete();
            return;
        }

        applyScoreChange(target, -3000);
        target.immunityCount = 2;
        broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中ヒット！ 得点-3,000点！ (${target.name}は選択不可状態になりました。攻撃中断)`);
        onComplete();
    }

    doNextAttack();
}

// 木の剣セット（グループ連撃）
function executeWoodSwordSetGroupAttack(gameState, attackerId, cardObj, maxAttacks, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, onComplete) {
    const attacker = gameState.players[attackerId];
    if (!attacker) { onComplete(); return; }

    const myScore = attacker.score;

    function getCandidates() {
        return Object.values(gameState.players).filter(p => {
            if (p.id === attackerId || (p.immunityCount && p.immunityCount > 0) || cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
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

                broadcastGameState(`${attacker.name} の「木の剣セット」グループ攻撃は全員に外れました。（消費回数: ${attackCountUsed}/${maxAttacks}）`);

                setTimeout(() => { startSingleGroupAttack(); }, 500);
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
            if (attacker.darknessTurns && attacker.darknessTurns > 0) baseHitRate = 0.25;

            const ratePercent = Math.round(baseHitRate * 100);
            let logPrefix = `${attacker.name} の「木の剣セット」攻撃 (${attackCountUsed + 1}/${maxAttacks}回目, 対象: ${target.name})！ `;

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
                    target.defenseCard.revealed = true;
                    let msg = logPrefix + `(命中率:${ratePercent}%) 命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
                    if (target.defenseCard.card.id === 'grenade') {
                        executeGrenadeDefenseCounter(gameState, target.id, broadcastGameState);
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
                broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！（攻撃中断）`);
                onComplete();
                return;
            }

            if (target.invincibleTurns && target.invincibleTurns > 0) {
                if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
                broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！（攻撃中断）`);
                onComplete();
                return;
            }

            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中ヒット！ 得点-3,000点！ (${target.name}は選択不可状態になりました)`);

            setTimeout(() => startSingleGroupAttack(), 500);
        }

        processQueue(0);
    }

    startSingleGroupAttack();
}

// 標準攻撃（木の盾 / 木の剣 単体）
function executeStandardAttack(gameState, attackerId, targetId, cardId, io, broadcastGameState, skipIfImmuneToRound1CardEffect) {
    const attacker = gameState.players[attackerId];
    const target = gameState.players[targetId];

    if (skipIfImmuneToRound1CardEffect(target, attacker, '攻撃')) return;

    const cardName = cardId === 'wood_sword' ? '木の剣' : '木の盾';
    const isSteroid = target.steroidTurns && target.steroidTurns > 0;
    let logPrefix = `${attacker.name} が ${target.name} に「${cardName}」で攻撃！ `;

    let hitRate = 0.5;
    if (cardId === 'wood_shield') hitRate = getWoodShieldHitRate(attacker.score, target.score);
    if (attacker.darknessTurns && attacker.darknessTurns > 0) hitRate = hitRate * 0.5;

    if (hitRate <= 0) return;

    let isHit = Math.random() < hitRate;
    let ratePercent = Math.round(hitRate * 100);
    let rateText = `(命中率:${ratePercent}%) `;

    if (io) {
        let cutinRes = 'MISS';
        let defImg = null;

        if (isHit) {
            if (target.defenseCard && !isDefenseBlocked(target, attacker)) {
                cutinRes = 'BLOCK';
                defImg = target.defenseCard.card.image || `/images/${cardId}.png`;
            } else if (target.invincibleTurns && target.invincibleTurns > 0) {
                cutinRes = 'INVINCIBLE';
            } else if (isSteroid) {
                cutinRes = 'STEROID';
            } else {
                cutinRes = 'HIT';
            }
        }

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
    }

    function finalizeStandardAttack() {
        if (!isHit) {
            broadcastGameState(logPrefix + rateText + `攻撃は外れた！（ミス）`);
            return;
        }

        if (target.defenseCard) {
            if (isDefenseBlocked(target, attacker)) {
                broadcastGameState(logPrefix + rateText + `命中！相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！`);
            } else {
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
        }

        if (target.invincibleTurns && target.invincibleTurns > 0) {
            if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            broadcastGameState(logPrefix + rateText + `命中！しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！`);
            return;
        }

        if (isSteroid) {
            target.steroidRevealed = true;
            broadcastGameState(logPrefix + rateText + `命中！しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！`);
            return;
        }

        applyScoreChange(target, -3000);
        target.immunityCount = 2;
        broadcastGameState(logPrefix + rateText + `命中ヒット！ 得点-3,000点！ (${target.name}は選択不可状態になりました)`);
    }

    setTimeout(finalizeStandardAttack, 1400);
}

module.exports = {
    executeWoodSwordAttack,
    executeWoodSwordSetAttack,
    executeWoodSwordSetGroupAttack,
    executeStandardAttack
};