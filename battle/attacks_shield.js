/**
 * 盾系攻撃カード実行モジュール (battle/attacks_shield.js)
 * 木の盾・青銅の盾・木の盾セット・青銅の盾セット
 * ※命中率0%のプレイヤーを対象およびカットイン演出から完全に除外
 */

const {
    applyScoreChange,
    isDefenseBlocked,
    getWoodShieldHitRate,
    getBronzeShieldLowerHitRate
} = require('./common');

const { tryAutoTriggerDefense } = require('./triggers');
const { tryAutoSetAndBlockDefense } = require('./auto_defense');
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
    let pendingDarkMatterCutin = null;

    // 防御カード判定（セット中または手札からの自動セット）
    const isTargetBuffed = (target.invincibleTurns > 0 || target.steroidTurns > 0);
    const defResult = (!isTargetBuffed || target.defenseCard)
        ? tryAutoSetAndBlockDefense(gameState, target, attacker, {
            onGrenadeCounter: (gs, tid) => executeGrenadeDefenseCounter(gs, tid, broadcastGameState),
            broadcastGameState: broadcastGameState
        })
        : { blocked: false };

    if (defResult.blocked) {
        defImg = defResult.defImg;
        finalLog = logPrefix + `命中！ ${defResult.defMsg}`;
        cutinRes = 'BLOCK';
    } else if (target.steroidTurns && target.steroidTurns > 0) {
        target.steroidRevealed = true;
        finalLog = logPrefix + `命中！しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！`;
        cutinRes = 'STEROID';
    } else if (target.invincibleTurns && target.invincibleTurns > 0) {
        if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
        finalLog = logPrefix + `命中！しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！`;
        cutinRes = 'INVINCIBLE';
    } else {
        // 手札カウンター判定
        const autoRes = tryAutoTriggerDefense(gameState, target, {
            allowSteroid: true,
            isImmuneToRound1CardEffect: skipIfImmuneToRound1CardEffect,
            broadcastGameState: broadcastGameState
        });

        if (autoRes) {
            cutinRes = autoRes.cardId === 'steroid' ? 'STEROID' : 'INVINCIBLE';
            finalLog = logPrefix + `命中！しかし ${target.name} の手札から「${autoRes.cardName}」が自動発動！攻撃が無効化されました！\n(${autoRes.logMsg})`;
            if (autoRes.resolveDarkMatterPenalty) {
                const dmRes = autoRes.resolveDarkMatterPenalty(gameState, io);
                if (dmRes && dmRes.darkMatterCutinData) {
                    pendingDarkMatterCutin = dmRes.darkMatterCutinData;
                }
            }
        } else {
            let blockedNotice = (target.defenseCard && isDefenseBlocked(target, attacker)) ? ` (セット中「${target.defenseCard.card.name}」は格上攻撃のため貫通！)` : '';
            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            finalLog = logPrefix + `命中ヒット！${blockedNotice} 得点-3,000点！ (${target.name}は選択不可状態になりました)`;
            cutinRes = 'HIT';
        }
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

        if (pendingDarkMatterCutin) {
            io.emit('playAttackCutin', pendingDarkMatterCutin);
        }
    }

    const duration = pendingDarkMatterCutin ? 2800 : 1400;
    setTimeout(() => {
        broadcastGameState(finalLog);
    }, duration);
}

// 青銅の盾（グループ攻撃：点差5,000点以上[命中率0%]を完全除外）
function executeBronzeShieldGroupAttack(gameState, attackerId, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1) {
    const attacker = gameState.players[attackerId];
    if (!attacker) return;

    const myScore = attacker.score;
    // 点差が5,000点未満（命中率 > 0%）のプレイヤーのみを抽出
    let candidates = Object.values(gameState.players).filter(p => {
        if (p.id === attackerId || (p.immunityCount && p.immunityCount > 0) || cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
        const diff = myScore - p.score;
        return diff > 0 && diff < 5000;
    });

    if (candidates.length === 0) {
        broadcastGameState(`${attacker.name} が「青銅の盾」で攻撃を開始しましたが、対象となる下位プレイヤー（点差5,000点以内）がいませんでした。`);
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

    // 命中率0%の除外されたプレイヤーのみでカットインを構築
    const defendersList = attackQueue.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar ? `/images/avatars/${p.avatar}.png` : '/images/avatars/avatar_default.png'
    }));

    const cutinResults = [];
    let finalLog = '';
    let stoppedEarly = false;
    let pendingDarkMatterCutin = null;

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

        // 防御カード判定
        const isTargetBuffed = (target.invincibleTurns > 0 || target.steroidTurns > 0);
        const defResult = (!isTargetBuffed || target.defenseCard)
            ? tryAutoSetAndBlockDefense(gameState, target, attacker, {
                onGrenadeCounter: (gs, tid) => executeGrenadeDefenseCounter(gs, tid, broadcastGameState),
                broadcastGameState: broadcastGameState
            })
            : { blocked: false };

        if (defResult.blocked) {
            finalLog = `${attacker.name} の「青銅の盾」攻撃！ ${defResult.defMsg}（攻撃終了）`;
            cutinResults.push({ targetId: target.id, result: 'BLOCK', defCardImage: defResult.defImg });
            stoppedEarly = true;
            break;
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

        // 手札カウンター判定
        const autoRes = tryAutoTriggerDefense(gameState, target, {
            allowSteroid: true,
            isImmuneToRound1CardEffect: skipIfImmuneToRound1CardEffect,
            broadcastGameState: broadcastGameState
        });

        if (autoRes) {
            cutinResults.push({ targetId: target.id, result: autoRes.cardId === 'steroid' ? 'STEROID' : 'INVINCIBLE' });
            finalLog = `${attacker.name} の「青銅の盾」攻撃！ しかし ${target.name} の手札から「${autoRes.cardName}」が自動発動！攻撃が無効化されました！（攻撃終了）\n(${autoRes.logMsg})`;
            if (autoRes.resolveDarkMatterPenalty) {
                const dmRes = autoRes.resolveDarkMatterPenalty(gameState, io);
                if (dmRes && dmRes.darkMatterCutinData) {
                    pendingDarkMatterCutin = dmRes.darkMatterCutinData;
                }
            }
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

        if (pendingDarkMatterCutin) {
            io.emit('playAttackCutin', pendingDarkMatterCutin);
        }
    }

    const baseDuration = Math.max(1200, cutinResults.length * 600 + 800);
    const animDuration = pendingDarkMatterCutin ? (baseDuration + 1400) : baseDuration;
    setTimeout(() => {
        broadcastGameState(finalLog);
    }, animDuration);
}

// 青銅の盾セット（単体最寄動的連撃）
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
    let pendingDarkMatterCutin = null;

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

        // 防御カード判定
        const isTargetBuffed = (target.invincibleTurns > 0 || target.steroidTurns > 0);
        const defResult = (!isTargetBuffed || target.defenseCard)
            ? tryAutoSetAndBlockDefense(gameState, target, attacker, {
                onGrenadeCounter: (gs, tid) => executeGrenadeDefenseCounter(gs, tid, broadcastGameState),
                broadcastGameState: broadcastGameState
            })
            : { blocked: false };

        if (defResult.blocked) {
            defImg = defResult.defImg;
            logs.push(logPrefix + `命中！ ${defResult.defMsg}`);
            cutinRes = 'BLOCK';
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
            // 手札カウンター判定
            const autoRes = tryAutoTriggerDefense(gameState, target, {
                allowSteroid: true,
                isImmuneToRound1CardEffect: skipIfImmuneToRound1CardEffect,
                broadcastGameState: broadcastGameState
            });

            if (autoRes) {
                cutinRes = autoRes.cardId === 'steroid' ? 'STEROID' : 'INVINCIBLE';
                logs.push(logPrefix + `命中！しかし ${target.name} の手札から「${autoRes.cardName}」が自動発動！攻撃が無効化されました！（連撃中断）\n(${autoRes.logMsg})`);
                if (autoRes.resolveDarkMatterPenalty) {
                    const dmRes = autoRes.resolveDarkMatterPenalty(gameState, io);
                    if (dmRes && dmRes.darkMatterCutinData) {
                        pendingDarkMatterCutin = dmRes.darkMatterCutinData;
                    }
                }
                stoppedByInvincible = true;
            } else {
                let blockedNotice = (target.defenseCard && isDefenseBlocked(target, attacker)) ? ` (セット中「${target.defenseCard.card.name}」は格上攻撃のため貫通！)` : '';
                applyScoreChange(target, -3000);
                target.immunityCount = 2;
                logs.push(logPrefix + `命中ヒット！${blockedNotice} 得点-3,000点！ (${target.name}は選択不可状態になりました)`);
                cutinRes = 'HIT';
            }
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

        if (pendingDarkMatterCutin) {
            io.emit('playAttackCutin', pendingDarkMatterCutin);
        }
    }

    const baseDuration = Math.max(1500, rounds.length * 1300 + 600);
    const totalDuration = pendingDarkMatterCutin ? (baseDuration + 1400) : baseDuration;
    setTimeout(() => {
        onComplete(logs.join('\n'));
    }, totalDuration);
}

// 青銅の盾セット（グループ連撃：点差5,000点以上[命中率0%]を完全除外）
function executeBronzeShieldSetGroupAttack(gameState, attackerId, cardObj, maxAttacks, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, onComplete) {
    const attacker = gameState.players[attackerId];
    if (!attacker) { onComplete(); return; }

    const myScore = attacker.score;
    // 点差が5,000点未満（命中率 > 0%）のプレイヤーのみを抽出
    const initialCandidates = Object.values(gameState.players).filter(p => {
        if (p.id === attackerId || (p.immunityCount && p.immunityCount > 0) || cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
        const diff = myScore - p.score;
        return diff > 0 && diff < 5000;
    });

    if (initialCandidates.length === 0) {
        broadcastGameState(`${attacker.name} が「青銅の盾セット」で攻撃を開始しましたが、対象となる下位プレイヤー（点差5,000点以内）がいませんでした。`);
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
    let pendingDarkMatterCutin = null;

    for (let r = 0; r < maxAttacks; r++) {
        if (cardObj.usesLeft <= 0 || stoppedByInvincible) break;

        const attackQueue = sortedFixedList.filter(p => {
            const livePlayer = gameState.players[p.id];
            if (!livePlayer) return false;
            if (livePlayer.immunityCount && livePlayer.immunityCount > 0) return false;
            const diff = myScore - livePlayer.score;
            return diff > 0 && diff < 5000;
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

            // 防御カード判定
            const isTargetBuffed = (target.invincibleTurns > 0 || target.steroidTurns > 0);
            const defResult = (!isTargetBuffed || target.defenseCard)
                ? tryAutoSetAndBlockDefense(gameState, target, attacker, {
                    onGrenadeCounter: (gs, tid) => executeGrenadeDefenseCounter(gs, tid, broadcastGameState),
                    broadcastGameState: broadcastGameState
                })
                : { blocked: false };

            if (defResult.blocked) {
                logs.push(`${attacker.name} の「青銅の盾セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目)！ ${defResult.defMsg}`);
                currentRoundResults.push({ targetId: target.id, result: 'BLOCK', defCardImage: defResult.defImg });
                hitInThisRound = true;
                break;
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

            // 手札カウンター判定
            const autoRes = tryAutoTriggerDefense(gameState, target, {
                allowSteroid: true,
                isImmuneToRound1CardEffect: skipIfImmuneToRound1CardEffect,
                broadcastGameState: broadcastGameState
            });

            if (autoRes) {
                currentRoundResults.push({ targetId: target.id, result: autoRes.cardId === 'steroid' ? 'STEROID' : 'INVINCIBLE' });
                logs.push(`${attacker.name} の「青銅の盾セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目)！ しかし ${target.name} の手札から「${autoRes.cardName}」が自動発動！攻撃が無効化されました！（連撃中断）\n(${autoRes.logMsg})`);
                if (autoRes.resolveDarkMatterPenalty) {
                    const dmRes = autoRes.resolveDarkMatterPenalty(gameState, io);
                    if (dmRes && dmRes.darkMatterCutinData) {
                        pendingDarkMatterCutin = dmRes.darkMatterCutinData;
                    }
                }
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

        if (pendingDarkMatterCutin) {
            io.emit('playAttackCutin', pendingDarkMatterCutin);
        }
    }

    const baseDuration = Math.max(1500, rounds.length * 1300 + 600);
    const totalDuration = pendingDarkMatterCutin ? (baseDuration + 1400) : baseDuration;
    setTimeout(() => {
        onComplete(logs.join('\n'));
    }, totalDuration);
}

// 木の盾（グループ攻撃：点差10,000点以上[命中率0%]を完全除外）
function executeWoodShieldGroupAttack(gameState, attackerId, groupType, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1) {
    const attacker = gameState.players[attackerId];
    if (!attacker) return;

    const myScore = attacker.score;

    // 点差が10,000点未満（命中率 > 0%）のプレイヤーのみを抽出
    let candidates = Object.values(gameState.players).filter(p => {
        if (p.id === attackerId || (p.immunityCount && p.immunityCount > 0) || cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
        const diff = Math.abs(myScore - p.score);
        if (diff >= 10000) return false; // 命中率0%を除外
        return groupType === 'EQUAL_OR_HIGHER' ? p.score >= myScore : p.score < myScore;
    });

    if (candidates.length === 0) {
        broadcastGameState(`${attacker.name} が「木の盾」で攻撃を開始しましたが、対象となるプレイヤー（点差10,000点未満）がいませんでした。`);
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

    // 命中率0%を除外した対象のみでカットインを構築
    const defendersList = attackQueue.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar ? `/images/avatars/${p.avatar}.png` : '/images/avatars/avatar_default.png'
    }));

    const cutinResults = [];
    let finalLog = '';
    let stoppedEarly = false;
    let pendingDarkMatterCutin = null;

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

        // 防御カード判定
        const isTargetBuffed = (target.invincibleTurns > 0 || target.steroidTurns > 0);
        const defResult = (!isTargetBuffed || target.defenseCard)
            ? tryAutoSetAndBlockDefense(gameState, target, attacker, {
                onGrenadeCounter: (gs, tid) => executeGrenadeDefenseCounter(gs, tid, broadcastGameState),
                broadcastGameState: broadcastGameState
            })
            : { blocked: false };

        if (defResult.blocked) {
            finalLog = `${attacker.name} の「木の盾」攻撃！ ${defResult.defMsg}（攻撃中断）`;
            cutinResults.push({ targetId: target.id, result: 'BLOCK', defCardImage: defResult.defImg });
            stoppedEarly = true;
            break;
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

        // 手札カウンター判定
        const autoRes = tryAutoTriggerDefense(gameState, target, {
            allowSteroid: true,
            isImmuneToRound1CardEffect: skipIfImmuneToRound1CardEffect,
            broadcastGameState: broadcastGameState
        });

        if (autoRes) {
            cutinResults.push({ targetId: target.id, result: autoRes.cardId === 'steroid' ? 'STEROID' : 'INVINCIBLE' });
            finalLog = `${attacker.name} の「木の盾」攻撃！ しかし ${target.name} の手札から「${autoRes.cardName}」が自動発動！攻撃が無効化されました！（攻撃中断）\n(${autoRes.logMsg})`;
            if (autoRes.resolveDarkMatterPenalty) {
                const dmRes = autoRes.resolveDarkMatterPenalty(gameState, io);
                if (dmRes && dmRes.darkMatterCutinData) {
                    pendingDarkMatterCutin = dmRes.darkMatterCutinData;
                }
            }
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

        if (pendingDarkMatterCutin) {
            io.emit('playAttackCutin', pendingDarkMatterCutin);
        }
    }

    const baseDuration = Math.max(1200, cutinResults.length * 600 + 800);
    const animDuration = pendingDarkMatterCutin ? (baseDuration + 1400) : baseDuration;
    setTimeout(() => {
        broadcastGameState(finalLog);
    }, animDuration);
}

// 木の盾セット（グループ連撃：点差10,000点以上[命中率0%]を完全除外）
function executeShieldSetGroupAttack(gameState, attackerId, groupType, cardObj, maxAttacks, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, onComplete) {
    const attacker = gameState.players[attackerId];
    if (!attacker) { onComplete(); return; }

    const myScore = attacker.score;

    // 点差が10,000点未満（命中率 > 0%）のプレイヤーのみを抽出
    const initialCandidates = Object.values(gameState.players).filter(p => {
        if (p.id === attackerId || (p.immunityCount && p.immunityCount > 0) || cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
        const diff = Math.abs(myScore - p.score);
        if (diff >= 10000) return false; // 命中率0%を除外
        return groupType === 'EQUAL_OR_HIGHER' ? p.score >= myScore : p.score < myScore;
    });

    if (initialCandidates.length === 0) {
        broadcastGameState(`${attacker.name} が「木の盾セット」で攻撃を開始しましたが、対象となるプレイヤー（点差10,000点未満）がいませんでした。`);
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
    let pendingDarkMatterCutin = null;

    for (let r = 0; r < maxAttacks; r++) {
        if (cardObj.usesLeft <= 0 || stoppedByInvincible) break;

        // 各ラウンドでも点差10,000点未満の有効対象のみをフィルタ
        const attackQueue = sortedFixedList.filter(p => {
            const livePlayer = gameState.players[p.id];
            if (!livePlayer) return false;
            if (livePlayer.immunityCount && livePlayer.immunityCount > 0) return false;
            const diff = Math.abs(myScore - livePlayer.score);
            if (diff >= 10000) return false;
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

            // 防御カード判定
            const isTargetBuffed = (target.invincibleTurns > 0 || target.steroidTurns > 0);
            const defResult = (!isTargetBuffed || target.defenseCard)
                ? tryAutoSetAndBlockDefense(gameState, target, attacker, {
                    onGrenadeCounter: (gs, tid) => executeGrenadeDefenseCounter(gs, tid, broadcastGameState),
                    broadcastGameState: broadcastGameState
                })
                : { blocked: false };

            if (defResult.blocked) {
                logs.push(`${attacker.name} の「木の盾セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目)！ ${defResult.defMsg}`);
                currentRoundResults.push({ targetId: target.id, result: 'BLOCK', defCardImage: defResult.defImg });
                hitInThisRound = true;
                break;
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

            // 手札カウンター判定
            const autoRes = tryAutoTriggerDefense(gameState, target, {
                allowSteroid: true,
                isImmuneToRound1CardEffect: skipIfImmuneToRound1CardEffect,
                broadcastGameState: broadcastGameState
            });

            if (autoRes) {
                currentRoundResults.push({ targetId: target.id, result: autoRes.cardId === 'steroid' ? 'STEROID' : 'INVINCIBLE' });
                logs.push(`${attacker.name} の「木の盾セット」攻撃 (${actualAttacksDone}/${maxAttacks}回目)！ しかし ${target.name} の手札から「${autoRes.cardName}」が自動発動！攻撃が無効化されました！（連撃中断）\n(${autoRes.logMsg})`);
                if (autoRes.resolveDarkMatterPenalty) {
                    const dmRes = autoRes.resolveDarkMatterPenalty(gameState, io);
                    if (dmRes && dmRes.darkMatterCutinData) {
                        pendingDarkMatterCutin = dmRes.darkMatterCutinData;
                    }
                }
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

        if (pendingDarkMatterCutin) {
            io.emit('playAttackCutin', pendingDarkMatterCutin);
        }
    }

    const baseDuration = Math.max(1500, rounds.length * 1300 + 600);
    const totalDuration = pendingDarkMatterCutin ? (baseDuration + 1400) : baseDuration;
    setTimeout(() => {
        onComplete(logs.join('\n'));
    }, totalDuration);
}

module.exports = {
    executeBronzeShieldClosestAttack,
    executeBronzeShieldGroupAttack,
    executeBronzeShieldSetAttack,
    executeBronzeShieldSetGroupAttack,
    executeWoodShieldGroupAttack,
    executeShieldSetGroupAttack
};