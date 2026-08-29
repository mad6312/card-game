/**
 * 盾系攻撃カード実行モジュール (battle/attacks_shield.js)
 * 木の盾・青銅の盾・木の盾セット・青銅の盾セット
 */

const {
    applyScoreChange,
    isDefenseBlocked,
    getWoodShieldHitRate,
    getBronzeShieldLowerHitRate
} = require('./common');

const { executeGrenadeDefenseCounter } = require('./attacks_gun');

// 青銅の盾（単体最寄：カットイン完全同期）
function executeBronzeShieldClosestAttack(gameState, attackerId, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1) {
    const attacker = gameState.players[attackerId];
    if (!attacker) return;

    const myScore = attacker.score;
    const allPlayers = Object.values(gameState.players);

    const candidates = allPlayers.filter(p => {
        if (p.id === attackerId || (p.immunityCount && p.immunityCount > 0) || cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
        const diff = p.score - myScore;
        return diff >= 0 && diff <= 10000;
    });

    if (candidates.length === 0) {
        broadcastGameState(`${attacker.name} が「青銅の盾」で攻撃を行いましたが、対象となるプレイヤーがいませんでした。`);
        return;
    }

    const minDiff = Math.min(...candidates.map(p => p.score - myScore));
    const closestCandidates = candidates.filter(p => (p.score - myScore) === minDiff);
    const target = closestCandidates[Math.floor(Math.random() * closestCandidates.length)];

    if (skipIfImmuneToRound1CardEffect(target, attacker, '「青銅の盾」攻撃')) return;

    let logPrefix = `${attacker.name} が ${target.name} に「青銅の盾」で攻撃！ (必中) `;
    let cutinRes = 'HIT';
    let defImg = null;
    let finalLog = '';

    if (target.defenseCard) {
        if (isDefenseBlocked(target, attacker)) {
            finalLog = logPrefix + `命中！相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！`;
            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            finalLog += ` 得点-3,000点！ (${target.name}は選択不可状態になりました)`;
            cutinRes = 'HIT';
        } else {
            target.defenseCard.usesLeft -= 1;
            target.defenseCard.revealed = true;
            defImg = target.defenseCard.card.image || '/images/wood_shield.png';
            let msg = logPrefix + `命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
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
    } else if (target.steroidTurns && target.steroidTurns > 0) {
        target.steroidRevealed = true;
        finalLog = logPrefix + `命中！しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！`;
        cutinRes = 'STEROID';
    } else if (target.invincibleTurns && target.invincibleTurns > 0) {
        if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
        finalLog = logPrefix + `命中！しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！`;
        cutinRes = 'INVINCIBLE';
    } else {
        applyScoreChange(target, -3000);
        target.immunityCount = 2;
        finalLog = logPrefix + `命中ヒット！ 得点-3,000点！ (${target.name}は選択不可状態になりました)`;
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
                id: 'bronze_shield',
                name: '青銅の盾',
                image: '/images/bronze_shield.png'
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

// 青銅の盾（グループ攻撃：カットイン完全同期）
function executeBronzeShieldGroupAttack(gameState, attackerId, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1) {
    const attacker = gameState.players[attackerId];
    if (!attacker) return;

    const myScore = attacker.score;
    let candidates = Object.values(gameState.players).filter(p => {
        if (p.id === attackerId || (p.immunityCount && p.immunityCount > 0) || cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
        return p.score < myScore;
    });

    if (candidates.length === 0) {
        broadcastGameState(`${attacker.name} が「青銅の盾」で攻撃を開始しましたが、対象となる下位プレイヤーがいませんでした。`);
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
        const group = [...grouped[diff]];
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

    const cutinResults = [];
    let finalLog = '';
    let stoppedEarly = false;

    for (let i = 0; i < attackQueue.length; i++) {
        if (stoppedEarly) break;

        const target = gameState.players[attackQueue[i].id];
        if (!target) continue;

        let hitRate = getBronzeShieldLowerHitRate(attacker.score, target.score);
        if (attacker.darknessTurns && attacker.darknessTurns > 0) hitRate = hitRate * 0.5;

        if (hitRate <= 0) {
            cutinResults.push({ targetId: target.id, result: 'MISS' });
            continue;
        }

        const ratePercent = Math.round(hitRate * 100);
        const isHit = Math.random() < hitRate;

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
                let msg = `${attacker.name} の「青銅の盾」攻撃！ しかし ${target.name} の防御カード「${target.defenseCard.card.name}」で無効化されました！（攻撃終了）`;
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
            finalLog = `${attacker.name} の「青銅の盾」攻撃！ しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！（攻撃終了）`;
            cutinResults.push({ targetId: target.id, result: 'STEROID' });
            stoppedEarly = true;
            break;
        }

        if (target.invincibleTurns && target.invincibleTurns > 0) {
            if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            finalLog = `${attacker.name} の「青銅の盾」攻撃！ しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！（攻撃終了）`;
            cutinResults.push({ targetId: target.id, result: 'INVINCIBLE' });
            stoppedEarly = true;
            break;
        }

        applyScoreChange(target, -3000);
        target.immunityCount = 2;
        finalLog = `${attacker.name} の「青銅の盾」攻撃 (対象: ${target.name})！ (命中率:${ratePercent}%) 命中ヒット！ 得点-3,000点！ (${target.name}は選択不可状態になりました。攻撃終了)`;
        cutinResults.push({ targetId: target.id, result: 'HIT' });
        stoppedEarly = true;
        break;
    }

    if (!finalLog) {
        finalLog = `${attacker.name} の「青銅の盾」攻撃は誰にも命中・無効化されず終了しました。`;
    }

    if (io) {
        io.emit('playAttackCutin', {
            attacker: {
                id: attacker.id,
                name: attacker.name,
                avatar: attacker.avatar ? `/images/avatars/${attacker.avatar}.png` : '/images/avatars/avatar_default.png'
            },
            card: {
                id: 'bronze_shield',
                name: '青銅の盾',
                image: '/images/bronze_shield.png'
            },
            defenders: defendersList,
            results: cutinResults
        });
    }

    const animDuration = Math.max(1200, cutinResults.length * 600 + 800);
    setTimeout(() => {
        broadcastGameState(finalLog);
    }, animDuration);
}

// 青銅の盾セット（単体最寄動的連撃：カットイン完全同期）
function executeBronzeShieldSetAttack(gameState, attackerId, cardObj, maxAttacks, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, onComplete) {
    const attacker = gameState.players[attackerId];
    if (!attacker) { onComplete(); return; }

    const myScore = attacker.score;
    const initialCandidates = Object.values(gameState.players).filter(p => {
        if (p.id === attackerId || (p.immunityCount && p.immunityCount > 0) || cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
        const diff = p.score - myScore;
        return diff >= 0 && diff <= 10000;
    });

    if (initialCandidates.length === 0) {
        broadcastGameState(`${attacker.name} が「青銅の盾セット」で攻撃を行いましたが、対象となるプレイヤーがいませんでした。`);
        onComplete();
        return;
    }

    const rounds = [];
    const logs = [];
    const defendersMap = {};
    let stoppedByInvincible = false;
    let actualAttacksDone = 0;

    for (let r = 0; r < maxAttacks; r++) {
        if (cardObj.usesLeft <= 0 || stoppedByInvincible) break;

        const currentCandidates = Object.values(gameState.players).filter(p => {
            if (p.id === attackerId || (p.immunityCount && p.immunityCount > 0) || cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
            const diff = p.score - myScore;
            return diff >= 0 && diff <= 10000;
        });

        if (currentCandidates.length === 0) break;

        const minDiff = Math.min(...currentCandidates.map(p => p.score - myScore));
        const closestGroup = currentCandidates.filter(p => (p.score - myScore) === minDiff);
        const target = closestGroup[Math.floor(Math.random() * closestGroup.length)];

        defendersMap[target.id] = {
            id: target.id,
            name: target.name,
            avatar: target.avatar ? `/images/avatars/${target.avatar}.png` : '/images/avatars/avatar_default.png'
        };

        actualAttacksDone++;
        cardObj.usesLeft -= 1;

        let logPrefix = `${attacker.name} が ${target.name} に「青銅の盾セット」で攻撃 (${actualAttacksDone}/${maxAttacks}回目, 必中)！ `;
        let cutinRes = 'HIT';
        let defImg = null;

        if (target.defenseCard) {
            if (isDefenseBlocked(target, attacker)) {
                logs.push(logPrefix + `命中！相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！ 得点-3,000点！ (${target.name}は選択不可状態になりました)`);
                applyScoreChange(target, -3000);
                target.immunityCount = 2;
                cutinRes = 'HIT';
            } else {
                target.defenseCard.usesLeft -= 1;
                target.defenseCard.revealed = true;
                defImg = target.defenseCard.card.image || '/images/wood_shield.png';
                let msg = logPrefix + `命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
                if (target.defenseCard.card.id === 'grenade') {
                    executeGrenadeDefenseCounter(gameState, target.id, broadcastGameState);
                }
                if (target.defenseCard && target.defenseCard.usesLeft <= 0) {
                    target.defenseCard = null;
                    msg += '（相手の防御カード破棄）';
                }
                logs.push(msg);
                cutinRes = 'BLOCK';
            }
        } else if (target.steroidTurns && target.steroidTurns > 0) {
            target.steroidRevealed = true;
            logs.push(logPrefix + `命中！しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！（連撃中断）`);
            cutinRes = 'STEROID';
            stoppedByInvincible = true;
        } else if (target.invincibleTurns && target.invincibleTurns > 0) {
            if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            logs.push(logPrefix + `命中！しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！（連撃中断）`);
            cutinRes = 'INVINCIBLE';
            stoppedByInvincible = true;
        } else {
            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            logs.push(logPrefix + `命中ヒット！ 得点-3,000点！ (${target.name}は選択不可状態になりました)`);
            cutinRes = 'HIT';
        }

        rounds.push({
            roundNumber: actualAttacksDone,
            results: [{ targetId: target.id, result: cutinRes, defCardImage: defImg }]
        });
    }

    if (io) {
        io.emit('playAttackCutin', {
            attacker: {
                id: attacker.id,
                name: attacker.name,
                avatar: attacker.avatar ? `/images/avatars/${attacker.avatar}.png` : '/images/avatars/avatar_default.png'
            },
            card: {
                id: 'bronze_shield_set',
                name: '青銅の盾セット',
                image: '/images/bronze_shield_set.png'
            },
            defenders: Object.values(defendersMap),
            rounds: rounds
        });
    }

    const totalDuration = Math.max(1500, rounds.length * 1300 + 600);
    setTimeout(() => {
        onComplete(logs.join('\n'));
    }, totalDuration);
}

// 青銅の盾セット（グループ連撃：カットイン完全同期）
function executeBronzeShieldSetGroupAttack(gameState, attackerId, cardObj, maxAttacks, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, onComplete) {
    const attacker = gameState.players[attackerId];
    if (!attacker) { onComplete(); return; }

    const myScore = attacker.score;
    const initialCandidates = Object.values(gameState.players).filter(p => {
        if (p.id === attackerId || (p.immunityCount && p.immunityCount > 0) || cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
        return p.score < myScore;
    });

    if (initialCandidates.length === 0) {
        broadcastGameState(`${attacker.name} が「青銅の盾セット」で攻撃を開始しましたが、対象となる下位プレイヤーがいませんでした。`);
        onComplete();
        return;
    }

    // 初回キュー構築（同点グループごとにシャッフルして完全固定）
    const initGrouped = {};
    initialCandidates.forEach(p => {
        const diff = Math.abs(myScore - p.score);
        if (!initGrouped[diff]) initGrouped[diff] = [];
        initGrouped[diff].push(p);
    });

    const initSortedDiffs = Object.keys(initGrouped).map(Number).sort((a, b) => a - b);
    const sortedFixedList = [];
    initSortedDiffs.forEach(diff => {
        const group = [...initGrouped[diff]];
        for (let i = group.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [group[i], group[j]] = [group[j], group[i]];
        }
        sortedFixedList.push(...group);
    });

    // 画面上の並び順（左側から先頭）をシャッフル後の順序に完全一致
    const defendersList = sortedFixedList.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar ? `/images/avatars/${p.avatar}.png` : '/images/avatars/avatar_default.png'
    }));

    const rounds = [];
    const logs = [];
    let stoppedByInvincible = false;
    let actualAttacksDone = 0;

    for (let r = 0; r < maxAttacks; r++) {
        if (cardObj.usesLeft <= 0 || stoppedByInvincible) break;

        // 固定順リストから現在有効な対象のみを抽出（再シャッフルしない）
        const attackQueue = sortedFixedList.filter(p => {
            const livePlayer = gameState.players[p.id];
            if (!livePlayer) return false;
            if (livePlayer.immunityCount && livePlayer.immunityCount > 0) return false;
            return livePlayer.score < myScore;
        });

        if (attackQueue.length === 0) break;

        actualAttacksDone++;
        cardObj.usesLeft -= 1;

        const currentRoundResults = [];
        let hitInThisRound = false;

        for (let i = 0; i < attackQueue.length; i++) {
            if (hitInThisRound) break;

            const target = gameState.players[attackQueue[i].id];
            if (!target) continue;

            let hitRate = getBronzeShieldLowerHitRate(attacker.score, target.score);
            if (attacker.darknessTurns && attacker.darknessTurns > 0) hitRate = hitRate * 0.5;

            if (hitRate <= 0) {
                currentRoundResults.push({ targetId: target.id, result: 'MISS' });
                continue;
            }

            const ratePercent = Math.round(hitRate * 100);
            const isHit = Math.random() < hitRate;

            if (!isHit) {
                currentRoundResults.push({ targetId: target.id, result: 'MISS' });
                continue;
            }

            if (target.defenseCard) {
                if (isDefenseBlocked(target, attacker)) {
                    // 貫通
                } else {
                    const defImg = target.defenseCard.card.image || '/images/wood_shield.png';
                    target.defenseCard.usesLeft -= 1;
                    target.defenseCard.revealed = true;
                    let msg = `${attacker.name} の「青銅の盾セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目)！ しかし ${target.name} の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
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
            }

            if (target.steroidTurns && target.steroidTurns > 0) {
                target.steroidRevealed = true;
                logs.push(`${attacker.name} の「青銅の盾セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目)！ しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！（連撃中断）`);
                currentRoundResults.push({ targetId: target.id, result: 'STEROID' });
                stoppedByInvincible = true;
                hitInThisRound = true;
                break;
            }

            if (target.invincibleTurns && target.invincibleTurns > 0) {
                if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
                logs.push(`${attacker.name} の「青銅の盾セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目)！ しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！（連撃中断）`);
                currentRoundResults.push({ targetId: target.id, result: 'INVINCIBLE' });
                stoppedByInvincible = true;
                hitInThisRound = true;
                break;
            }

            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            logs.push(`${attacker.name} の「青銅の盾セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目, 対象: ${target.name})！ (命中率:${ratePercent}%) 命中ヒット！ 得点-3,000点！ (${target.name}は選択不可状態になりました)`);
            currentRoundResults.push({ targetId: target.id, result: 'HIT' });
            hitInThisRound = true;
            break;
        }

        if (!hitInThisRound) {
            logs.push(`${attacker.name} の「青銅の盾セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目) は全員に外れました。`);
        }

        rounds.push({
            roundNumber: actualAttacksDone,
            results: currentRoundResults
        });
    }

    if (io) {
        io.emit('playAttackCutin', {
            attacker: {
                id: attacker.id,
                name: attacker.name,
                avatar: attacker.avatar ? `/images/avatars/${attacker.avatar}.png` : '/images/avatars/avatar_default.png'
            },
            card: {
                id: 'bronze_shield_set',
                name: '青銅の盾セット',
                image: '/images/bronze_shield_set.png'
            },
            defenders: defendersList,
            rounds: rounds
        });
    }

    const totalDuration = Math.max(1500, rounds.length * 1300 + 600);
    setTimeout(() => {
        onComplete(logs.join('\n'));
    }, totalDuration);
}

// 木の盾（グループ攻撃：カットイン完全同期）
function executeWoodShieldGroupAttack(gameState, attackerId, groupType, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1) {
    const attacker = gameState.players[attackerId];
    if (!attacker) return;

    const myScore = attacker.score;

    let candidates = Object.values(gameState.players).filter(p => {
        if (p.id === attackerId || (p.immunityCount && p.immunityCount > 0) || cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
        return groupType === 'EQUAL_OR_HIGHER' ? p.score >= myScore : p.score < myScore;
    });

    if (candidates.length === 0) {
        broadcastGameState(`${attacker.name} が「木の盾」で攻撃を開始しましたが、対象となるプレイヤーがいませんでした。`);
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
        const group = [...grouped[diff]];
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

    const cutinResults = [];
    let finalLog = '';
    let stoppedEarly = false;

    for (let i = 0; i < attackQueue.length; i++) {
        if (stoppedEarly) break;

        const target = gameState.players[attackQueue[i].id];
        if (!target) continue;

        let hitRate = getWoodShieldHitRate(attacker.score, target.score);
        if (attacker.darknessTurns && attacker.darknessTurns > 0) hitRate = hitRate * 0.5;

        if (hitRate <= 0) {
            cutinResults.push({ targetId: target.id, result: 'MISS' });
            continue;
        }

        const ratePercent = Math.round(hitRate * 100);
        const isHit = Math.random() < hitRate;

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
                let msg = `${attacker.name} の「木の盾」攻撃！ しかし ${target.name} の防御カード「${target.defenseCard.card.name}」で無効化されました！（攻撃中断）`;
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
            finalLog = `${attacker.name} の「木の盾」攻撃！ しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！（攻撃中断）`;
            cutinResults.push({ targetId: target.id, result: 'STEROID' });
            stoppedEarly = true;
            break;
        }

        if (target.invincibleTurns && target.invincibleTurns > 0) {
            if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            finalLog = `${attacker.name} の「木の盾」攻撃！ しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！（攻撃中断）`;
            cutinResults.push({ targetId: target.id, result: 'INVINCIBLE' });
            stoppedEarly = true;
            break;
        }

        applyScoreChange(target, -3000);
        target.immunityCount = 2;
        finalLog = `${attacker.name} の「木の盾」攻撃 (対象: ${target.name})！ (命中率:${ratePercent}%) 命中ヒット！ 得点-3,000点！ (${target.name}は選択不可状態になりました。攻撃中断)`;
        cutinResults.push({ targetId: target.id, result: 'HIT' });
        stoppedEarly = true;
        break;
    }

    if (!finalLog) {
        finalLog = `${attacker.name} の「木の盾」攻撃は誰にも命中・無効化されず終了しました。`;
    }

    if (io) {
        io.emit('playAttackCutin', {
            attacker: {
                id: attacker.id,
                name: attacker.name,
                avatar: attacker.avatar ? `/images/avatars/${attacker.avatar}.png` : '/images/avatars/avatar_default.png'
            },
            card: {
                id: 'wood_shield',
                name: '木の盾',
                image: '/images/wood_shield.png'
            },
            defenders: defendersList,
            results: cutinResults
        });
    }

    const animDuration = Math.max(1200, cutinResults.length * 600 + 800);
    setTimeout(() => {
        broadcastGameState(finalLog);
    }, animDuration);
}

// 木の盾セット（グループ連撃：複数回カットイン完全同期）
function executeShieldSetGroupAttack(gameState, attackerId, groupType, cardObj, maxAttacks, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, onComplete) {
    const attacker = gameState.players[attackerId];
    if (!attacker) { onComplete(); return; }

    const myScore = attacker.score;
    const initialCandidates = Object.values(gameState.players).filter(p => {
        if (p.id === attackerId || (p.immunityCount && p.immunityCount > 0) || cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
        return groupType === 'EQUAL_OR_HIGHER' ? p.score >= myScore : p.score < myScore;
    });

    if (initialCandidates.length === 0) {
        broadcastGameState(`${attacker.name} が「木の盾セット」で攻撃を開始しましたが、対象となるプレイヤーがいませんでした。`);
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
    const sortedFixedList = [];
    initSortedDiffs.forEach(diff => {
        const group = [...initGrouped[diff]];
        for (let i = group.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [group[i], group[j]] = [group[j], group[i]];
        }
        sortedFixedList.push(...group);
    });

    const defendersList = sortedFixedList.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar ? `/images/avatars/${p.avatar}.png` : '/images/avatars/avatar_default.png'
    }));

    const rounds = [];
    const logs = [];
    let stoppedByInvincible = false;
    let actualAttacksDone = 0;

    for (let r = 0; r < maxAttacks; r++) {
        if (cardObj.usesLeft <= 0 || stoppedByInvincible) break;

        const attackQueue = sortedFixedList.filter(p => {
            const livePlayer = gameState.players[p.id];
            if (!livePlayer) return false;
            if (livePlayer.immunityCount && livePlayer.immunityCount > 0) return false;
            return groupType === 'EQUAL_OR_HIGHER' ? livePlayer.score >= myScore : livePlayer.score < myScore;
        });

        if (attackQueue.length === 0) break;

        actualAttacksDone++;
        cardObj.usesLeft -= 1;

        const currentRoundResults = [];
        let hitInThisRound = false;

        for (let i = 0; i < attackQueue.length; i++) {
            if (hitInThisRound) break;

            const target = gameState.players[attackQueue[i].id];
            if (!target) continue;

            let hitRate = getWoodShieldHitRate(attacker.score, target.score);
            if (attacker.darknessTurns && attacker.darknessTurns > 0) hitRate = hitRate * 0.5;

            if (hitRate <= 0) {
                currentRoundResults.push({ targetId: target.id, result: 'MISS' });
                continue;
            }

            const ratePercent = Math.round(hitRate * 100);
            const isHit = Math.random() < hitRate;

            if (!isHit) {
                currentRoundResults.push({ targetId: target.id, result: 'MISS' });
                continue;
            }

            if (target.defenseCard) {
                if (isDefenseBlocked(target, attacker)) {
                    // 貫通
                } else {
                    const defImg = target.defenseCard.card.image || '/images/wood_shield.png';
                    target.defenseCard.usesLeft -= 1;
                    target.defenseCard.revealed = true;
                    let msg = `${attacker.name} の「木の盾セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目)！ しかし ${target.name} の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
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
            }

            if (target.steroidTurns && target.steroidTurns > 0) {
                target.steroidRevealed = true;
                logs.push(`${attacker.name} の「木の盾セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目)！ しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！（連撃中断）`);
                currentRoundResults.push({ targetId: target.id, result: 'STEROID' });
                stoppedByInvincible = true;
                hitInThisRound = true;
                break;
            }

            if (target.invincibleTurns && target.invincibleTurns > 0) {
                if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
                logs.push(`${attacker.name} の「木の盾セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目)！ しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！（連撃中断）`);
                currentRoundResults.push({ targetId: target.id, result: 'INVINCIBLE' });
                stoppedByInvincible = true;
                hitInThisRound = true;
                break;
            }

            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            logs.push(`${attacker.name} の「木の盾セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目, 対象: ${target.name})！ (命中率:${ratePercent}%) 命中ヒット！ 得点-3,000点！ (${target.name}は選択不可状態になりました)`);
            currentRoundResults.push({ targetId: target.id, result: 'HIT' });
            hitInThisRound = true;
            break;
        }

        if (!hitInThisRound) {
            logs.push(`${attacker.name} の「木の盾セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目) は全員に外れました。`);
        }

        rounds.push({
            roundNumber: actualAttacksDone,
            results: currentRoundResults
        });
    }

    if (io) {
        io.emit('playAttackCutin', {
            attacker: {
                id: attacker.id,
                name: attacker.name,
                avatar: attacker.avatar ? `/images/avatars/${attacker.avatar}.png` : '/images/avatars/avatar_default.png'
            },
            card: {
                id: 'wood_shield_set',
                name: '木の盾セット',
                image: '/images/wood_shield_set.png'
            },
            defenders: defendersList,
            rounds: rounds
        });
    }

    const totalDuration = Math.max(1500, rounds.length * 1300 + 600);
    setTimeout(() => {
        onComplete(logs.join('\n'));
    }, totalDuration);
}

// 木の盾セット（単体攻撃）
function executeShieldSetAttack(gameState, attackerId, targetId, cardObj, maxAttacks, broadcastGameState, skipIfImmuneToRound1CardEffect, onComplete) {
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
        let logPrefix = `${attacker.name} が ${target.name} に「木の盾セット」で攻撃 (${attackIndex}/${maxAttacks}回目)！ `;

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
                setTimeout(doNextAttack, 500);
                return;
            }
        }

        if (target.invincibleTurns && target.invincibleTurns > 0) {
            if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！`);
            setTimeout(doNextAttack, 500);
            return;
        }

        if (isSteroid) {
            target.steroidRevealed = true;
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！`);
            setTimeout(doNextAttack, 500);
            return;
        }

        applyScoreChange(target, -3000);
        target.immunityCount = 2;
        broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中ヒット！ 得点-3,000点！ (${target.name}が選択不可状態になったため攻撃中断)`);
        onComplete();
    }

    doNextAttack();
}

module.exports = {
    executeBronzeShieldClosestAttack,
    executeBronzeShieldGroupAttack,
    executeBronzeShieldSetAttack,
    executeBronzeShieldSetGroupAttack,
    executeWoodShieldGroupAttack,
    executeShieldSetAttack,
    executeShieldSetGroupAttack
};