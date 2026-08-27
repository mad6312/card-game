/**
 * 戦闘・攻撃・効果実行モジュール
 */

function resetScoreChanges(gameState) {
    Object.values(gameState.players).forEach(p => {
        p.scoreChange = 0;
    });
}

function applyScoreChange(player, amount) {
    player.prevScore = player.score;
    player.scoreChange = amount;
    player.score += amount;
}

function isDefenseBlocked(target, attacker) {
    if (!target.defenseCard) return false;
    const isRestricted = ['wood_sword', 'wood_sword_set', 'grenade'].includes(target.defenseCard.card.id);
    return isRestricted && (attacker.score > target.score);
}

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

// グレネードカウンター処理
function executeGrenadeDefenseCounter(gameState, defenderId, broadcastGameState) {
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
            counterLogs.push(`${target.name}(${stateName}ガード${defMsg ? '・' + defMsg : ''})`);
        } else {
            target.hand = [];
            target.defenseCard = null;
            applyScoreChange(target, -5000);
            target.immunityCount = 2;
            counterLogs.push(`${target.name}(-5,000点・手札防御全破棄・選択不可2T)`);
        }
    });

    broadcastGameState(`💥 ${defender.name} の「グレネード」カウンター発動！ 反撃対象: ${counterLogs.join(' / ')}`);
}

// グレネードスプラッシュ爆発
function executeGrenadeSplash(gameState, primaryTargetId, casterId, broadcastGameState, isImmuneToRound1CardEffect) {
    const primaryTarget = gameState.players[primaryTargetId];
    const caster = gameState.players[casterId];
    if (!primaryTarget || !caster) return;

    const centerScore = primaryTarget.score;
    const allPlayers = Object.values(gameState.players);
    const victims = allPlayers.filter(p => Math.abs(p.score - centerScore) <= 1000);
    const affectedLogs = [];

    victims.forEach(victim => {
        if (victim.id !== casterId && isImmuneToRound1CardEffect(victim.id, casterId)) {
            affectedLogs.push(`${victim.name}(1巡目効果無効)`);
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
            affectedLogs.push(`${victim.name}(${stateName}ガード${defMsg ? '・' + defMsg : ''})`);
        } else {
            victim.hand = [];
            victim.defenseCard = null;
            applyScoreChange(victim, -5000);
            victim.immunityCount = 2;
            affectedLogs.push(`${victim.name}(-5,000点・手札防御全破棄・選択不可2T)`);
        }
    });

    broadcastGameState(`💥 グレネード爆発！ 誘爆対象: ${affectedLogs.join(' / ')}`);
}

// グレネード単体攻撃
function executeGrenadeSingleAttack(gameState, attackerId, targetId, broadcastGameState, isImmuneToRound1CardEffect, skipIfImmuneToRound1CardEffect, socket) {
    const attacker = gameState.players[attackerId];
    const target = gameState.players[targetId];
    if (!attacker || !target) return;

    if (skipIfImmuneToRound1CardEffect(target, attacker, '「グレネード」攻撃')) return;

    const scoreDiff = target.score - attacker.score;
    if (scoreDiff < 0 || scoreDiff > 5000) {
        if (socket) socket.emit('errorMessage', '自分との得点差が0点以上+5,000点以下のプレイヤーのみ攻撃対象に指定できます。');
        return;
    }

    let baseHitRate = 0.5;
    if (attacker.darknessTurns && attacker.darknessTurns > 0) baseHitRate = 0.25;

    let logPrefix = `${attacker.name} が ${target.name} に「グレネード」で攻撃！ `;
    const isHit = Math.random() < baseHitRate;

    if (!isHit) {
        broadcastGameState(logPrefix + `(命中率:${baseHitRate * 100}%) 攻撃は外れた！（ミス）`);
        return;
    }

    let penetrateMsg = target.defenseCard ? ` (相手の防御カード「${target.defenseCard.card.name}」を貫通！)` : '';
    broadcastGameState(logPrefix + `(命中率:${baseHitRate * 100}%) 命中着弾！${penetrateMsg}`);
    executeGrenadeSplash(gameState, target.id, attackerId, broadcastGameState, isImmuneToRound1CardEffect);
}

// グレネードグループ攻撃
function executeGrenadeGroupAttack(gameState, attackerId, broadcastGameState, isImmuneToRound1CardEffect, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1) {
    const attacker = gameState.players[attackerId];
    if (!attacker) return;

    const myScore = attacker.score;
    const allPlayers = Object.values(gameState.players);

    let candidates = allPlayers.filter(p => {
        if (p.id === attackerId || (p.immunityCount && p.immunityCount > 0) || cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
        const diff = myScore - p.score;
        return diff >= 1 && diff <= 5000;
    });

    if (candidates.length === 0) {
        broadcastGameState(`${attacker.name} が「グレネード」で攻撃を開始しましたが、対象となる下位プレイヤー（-1〜-5,000点以内）がいませんでした。`);
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
            broadcastGameState(`${attacker.name} の「グレネード」攻撃は誰にも命中せず終了しました。`);
            return;
        }

        const target = gameState.players[attackQueue[index].id];
        if (!target) {
            processQueue(index + 1);
            return;
        }

        if (skipIfImmuneToRound1CardEffect(target, attacker, '「グレネード」攻撃')) {
            processQueue(index + 1);
            return;
        }

        let baseHitRate = 0.8;
        if (attacker.darknessTurns && attacker.darknessTurns > 0) baseHitRate = 0.4;

        const ratePercent = Math.round(baseHitRate * 100);
        let logPrefix = `${attacker.name} の「グレネード」攻撃 (対象: ${target.name})！ `;

        const isHit = Math.random() < baseHitRate;

        if (!isHit) {
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 攻撃は外れた！（ミス）`);
            setTimeout(() => processQueue(index + 1), 500);
            return;
        }

        let penetrateMsg = target.defenseCard ? ` (相手の防御カード「${target.defenseCard.card.name}」を貫通！)` : '';
        broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中着弾！${penetrateMsg}`);
        executeGrenadeSplash(gameState, target.id, attackerId, broadcastGameState, isImmuneToRound1CardEffect);
    }

    processQueue(0);
}

// 青銅の盾（単体最寄）
function executeBronzeShieldClosestAttack(gameState, attackerId, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1) {
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

    if (target.defenseCard) {
        if (isDefenseBlocked(target, attacker)) {
            broadcastGameState(logPrefix + `命中！相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！`);
        } else {
            target.defenseCard.usesLeft -= 1;
            target.defenseCard.revealed = true;
            let msg = logPrefix + `命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
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

    if (target.steroidTurns && target.steroidTurns > 0) {
        target.steroidRevealed = true;
        broadcastGameState(logPrefix + `命中！しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！`);
        return;
    }
    if (target.invincibleTurns && target.invincibleTurns > 0) {
        if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
        broadcastGameState(logPrefix + `命中！しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！`);
        return;
    }

    applyScoreChange(target, -3000);
    target.immunityCount = 2;
    broadcastGameState(logPrefix + `命中ヒット！ 得点-3,000点！ (${target.name}は選択不可状態になりました)`);
}

// 青銅の盾（グループ攻撃）
function executeBronzeShieldGroupAttack(gameState, attackerId, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1) {
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
        const group = grouped[diff];
        for (let i = group.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [group[i], group[j]] = [group[j], group[i]];
        }
        attackQueue.push(...group);
    });

    function processQueue(index) {
        if (index >= attackQueue.length) {
            broadcastGameState(`${attacker.name} の「青銅の盾」攻撃は誰にも命中・無効化されず終了しました。`);
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
        if (attacker.darknessTurns && attacker.darknessTurns > 0) hitRate = hitRate * 0.5;

        if (hitRate <= 0) {
            processQueue(index + 1);
            return;
        }

        const ratePercent = Math.round(hitRate * 100);
        let logPrefix = `${attacker.name} の「青銅の盾」攻撃 (対象: ${target.name})！ `;

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
                target.defenseCard.revealed = true;
                let msg = logPrefix + `(命中率:${ratePercent}%) 命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！（攻撃終了）`;
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

        if (target.steroidTurns && target.steroidTurns > 0) {
            target.steroidRevealed = true;
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！（攻撃終了）`);
            return;
        }
        if (target.invincibleTurns && target.invincibleTurns > 0) {
            if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！（攻撃終了）`);
            return;
        }

        applyScoreChange(target, -3000);
        target.immunityCount = 2;
        broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中ヒット！ 得点-3,000点！ (${target.name}は選択不可状態になりました。攻撃終了)`);
    }

    processQueue(0);
}

// 青銅の盾セット（単体最寄連撃）
function executeBronzeShieldSetAttack(gameState, attackerId, cardObj, maxAttacks, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, onComplete) {
    const attacker = gameState.players[attackerId];
    if (!attacker) { onComplete(); return; }

    let attackIndex = 0;

    function doNextAttack() {
        if (attackIndex >= maxAttacks || cardObj.usesLeft <= 0) {
            onComplete();
            return;
        }

        const currentAttacker = gameState.players[attackerId];
        const myScore = currentAttacker.score;
        const allPlayers = Object.values(gameState.players);

        const candidates = allPlayers.filter(p => {
            if (p.id === attackerId || (p.immunityCount && p.immunityCount > 0) || cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
            const diff = p.score - myScore;
            return diff >= 0 && diff <= 10000;
        });

        if (candidates.length === 0) {
            if (attackIndex === 0) {
                broadcastGameState(`${currentAttacker.name} が「青銅の盾セット」で攻撃を行いましたが、対象となるプレイヤーがいませんでした。`);
            } else {
                broadcastGameState(`${currentAttacker.name} の「青銅の盾セット」攻撃: 対象となるプレイヤーがいなくなったため終了しました。`);
            }
            onComplete();
            return;
        }

        const minDiff = Math.min(...candidates.map(p => p.score - myScore));
        const closestCandidates = candidates.filter(p => (p.score - myScore) === minDiff);
        const target = closestCandidates[Math.floor(Math.random() * closestCandidates.length)];

        if (skipIfImmuneToRound1CardEffect(target, currentAttacker, '「青銅の盾セット」攻撃')) {
            onComplete();
            return;
        }

        attackIndex++;
        cardObj.usesLeft -= 1;

        let logPrefix = `${currentAttacker.name} が ${target.name} に「青銅の盾セット」で攻撃 (${attackIndex}/${maxAttacks}回目, 必中)！ `;

        if (target.defenseCard) {
            if (isDefenseBlocked(target, currentAttacker)) {
                broadcastGameState(logPrefix + `命中！相手は「${target.defenseCard.card.name}」をセット中ですが、自分より得点が高いプレイヤーからの攻撃のため防御効果が発動しません！`);
            } else {
                target.defenseCard.usesLeft -= 1;
                target.defenseCard.revealed = true;
                let msg = logPrefix + `命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
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

        if (target.steroidTurns && target.steroidTurns > 0) {
            target.steroidRevealed = true;
            broadcastGameState(logPrefix + `命中！しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！（攻撃中断）`);
            onComplete();
            return;
        }

        if (target.invincibleTurns && target.invincibleTurns > 0) {
            if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            broadcastGameState(logPrefix + `命中！しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！（攻撃中断）`);
            onComplete();
            return;
        }

        applyScoreChange(target, -3000);
        target.immunityCount = 2;
        broadcastGameState(logPrefix + `命中ヒット！ 得点-3,000点！ (${target.name}は選択不可状態になりました)`);

        if (attackIndex < maxAttacks && cardObj.usesLeft > 0) {
            setTimeout(doNextAttack, 500);
        } else {
            onComplete();
        }
    }

    doNextAttack();
}

// 青銅の盾セット（グループ連撃）
function executeBronzeShieldSetGroupAttack(gameState, attackerId, cardObj, maxAttacks, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, onComplete) {
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

                broadcastGameState(`${attacker.name} の「青銅の盾セット」グループ攻撃は全員に外れました。（消費回数: ${attackCountUsed}/${maxAttacks}）`);

                setTimeout(() => { startSingleGroupAttack(); }, 500);
                return;
            }

            const target = gameState.players[attackQueue[index].id];
            if (!target) {
                processQueue(index + 1);
                return;
            }

            if (skipIfImmuneToRound1CardEffect(target, attacker, '「青銅の盾セット」攻撃')) {
                processQueue(index + 1);
                return;
            }

            let hitRate = getBronzeShieldLowerHitRate(attacker.score, target.score);
            if (attacker.darknessTurns && attacker.darknessTurns > 0) hitRate = hitRate * 0.5;

            if (hitRate <= 0) {
                processQueue(index + 1);
                return;
            }

            const ratePercent = Math.round(hitRate * 100);
            let logPrefix = `${attacker.name} の「青銅の盾セット」攻撃 (${attackCountUsed + 1}/${maxAttacks}回目, 対象: ${target.name})！ `;

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

// 木の盾（グループ攻撃）
function executeWoodShieldGroupAttack(gameState, attackerId, groupType, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1) {
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
        const group = grouped[diff];
        for (let i = group.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [group[i], group[j]] = [group[j], group[i]];
        }
        attackQueue.push(...group);
    });

    function processQueue(index) {
        if (index >= attackQueue.length) {
            broadcastGameState(`${attacker.name} の「木の盾」攻撃は誰にも命中・無効化されず終了しました。`);
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
        if (attacker.darknessTurns && attacker.darknessTurns > 0) hitRate = hitRate * 0.5;

        if (hitRate <= 0) {
            processQueue(index + 1);
            return;
        }

        const ratePercent = Math.round(hitRate * 100);
        let logPrefix = `${attacker.name} の「木の盾」攻撃 (対象: ${target.name})！ `;

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
                target.defenseCard.revealed = true;
                let msg = logPrefix + `(命中率:${ratePercent}%) 命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！（攻撃中断）`;
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

        if (target.steroidTurns && target.steroidTurns > 0) {
            target.steroidRevealed = true;
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！（攻撃中断）`);
            return;
        }
        if (target.invincibleTurns && target.invincibleTurns > 0) {
            if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中！しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！（攻撃中断）`);
            return;
        }

        applyScoreChange(target, -3000);
        target.immunityCount = 2;
        broadcastGameState(logPrefix + `(命中率:${ratePercent}%) 命中ヒット！ 得点-3,000点！ (${target.name}は選択不可状態になりました。攻撃中断)`);
    }

    processQueue(0);
}

// 木の盾セット（グループ連撃）
function executeShieldSetGroupAttack(gameState, attackerId, groupType, cardObj, maxAttacks, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, onComplete) {
    const attacker = gameState.players[attackerId];
    if (!attacker) { onComplete(); return; }

    const myScore = attacker.score;

    function getCandidates() {
        return Object.values(gameState.players).filter(p => {
            if (p.id === attackerId || (p.immunityCount && p.immunityCount > 0) || cannotSelectAsAttackTargetInRound1(attackerId, p.id)) return false;
            return groupType === 'EQUAL_OR_HIGHER' ? p.score >= myScore : p.score < myScore;
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

                broadcastGameState(`${attacker.name} の「木の盾セット」グループ攻撃は全員に外れました。（消費回数: ${attackCountUsed}/${maxAttacks}）`);

                setTimeout(() => { startSingleGroupAttack(); }, 500);
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
            if (attacker.darknessTurns && attacker.darknessTurns > 0) hitRate = hitRate * 0.5;
            if (hitRate <= 0) {
                processQueue(index + 1);
                return;
            }

            const ratePercent = Math.round(hitRate * 100);
            let logPrefix = `${attacker.name} の「木の盾セット」攻撃 (${attackCountUsed + 1}/${maxAttacks}回目, 対象: ${target.name})！ `;

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

// 木の剣（単体・グループ）
function executeWoodSwordAttack(gameState, attackerId, targetTypeOrId, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, socket) {
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
                    broadcastGameState(`${attacker.name} が「木の剣」を使用しましたが、対象となる下位プレイヤーがいませんでした。`);
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
            let logPrefix = `${attacker.name} の「木の剣」攻撃 (対象: ${target.name})！ `;

            let baseHitRate = 0.5;
            if (attacker.darknessTurns && attacker.darknessTurns > 0) baseHitRate = 0.25;
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
                    target.defenseCard.revealed = true;
                    let msg = logPrefix + `命中！しかし相手の防御カード「${target.defenseCard.card.name}」で無効化されました！`;
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
                broadcastGameState(logPrefix + `命中！しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！`);
                return;
            }

            if (isSteroid) {
                target.steroidRevealed = true;
                broadcastGameState(logPrefix + `命中！しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！`);
                return;
            }

            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            broadcastGameState(logPrefix + `命中ヒット！ 得点-3,000点！ (${target.name}は選択不可状態になりました。)`);
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
        if (socket) socket.emit('errorMessage', '自分との得点差が0点以上+5,000点以下のプレイヤーのみ攻撃対象に指定できます。');
        return;
    }

    let baseHitRate = 0.5;
    if (attacker.darknessTurns && attacker.darknessTurns > 0) baseHitRate = 0.25;
    let logPrefix = `${attacker.name} が ${target.name} に「木の剣」で攻撃！ `;
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
            return;
        }
    }

    if (target.invincibleTurns && target.invincibleTurns > 0) {
        if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
        broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！`);
        return;
    }

    if (isSteroid) {
        target.steroidRevealed = true;
        broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中！しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！`);
        return;
    }

    applyScoreChange(target, -3000);
    target.immunityCount = 2;
    broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中ヒット！ 得点-3,000点！ (${target.name}は選択不可状態になりました)`);
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

// ショットガン
function executeShotgunAttack(gameState, attackerId, targetTypeOrId, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, socket) {
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
                    broadcastGameState(`${attacker.name} が「ショットガン」を使用しましたが、対象となる下位プレイヤーがいませんでした。`);
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
            if (attacker.darknessTurns && attacker.darknessTurns > 0) baseHitRate = 0.25;
            const isHit = Math.random() < baseHitRate;
            let logPrefix = `${attacker.name} の「ショットガン」攻撃 (対象: ${target.name})！ `;

            if (!isHit) {
                broadcastGameState(logPrefix + `(命中率:${baseHitRate * 100}%) 攻撃は外れた！（ミス）`);
                setTimeout(processNextLowerTarget, 500);
                return;
            }

            let penetrateMsg = target.defenseCard ? ` (相手の防御カード「${target.defenseCard.card.name}」を貫通！)` : '';

            if (target.invincibleTurns && target.invincibleTurns > 0) {
                if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
                broadcastGameState(logPrefix + `命中！${penetrateMsg} しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！（攻撃終了）`);
                return;
            }

            if (target.steroidTurns && target.steroidTurns > 0) {
                target.steroidRevealed = true;
                broadcastGameState(logPrefix + `命中！${penetrateMsg} しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！（攻撃終了）`);
                return;
            }

            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            broadcastGameState(logPrefix + `命中ヒット！${penetrateMsg} 得点-3,000点！ (${target.name}は選択不可状態になりました。攻撃終了)`);
        }

        processNextLowerTarget();
        return;
    }

    const target = gameState.players[targetTypeOrId];
    if (!target) return;

    if (skipIfImmuneToRound1CardEffect(target, attacker, '「ショットガン」攻撃')) return;

    const scoreDiff = target.score - attacker.score;
    if (scoreDiff < 0 || scoreDiff > 5000) {
        if (socket) socket.emit('errorMessage', '自分との得点差が0点以上+5,000点以下のプレイヤーのみ攻撃対象に指定できます。');
        return;
    }

    let baseHitRate = 0.5;
    if (attacker.darknessTurns && attacker.darknessTurns > 0) baseHitRate = 0.25;
    let logPrefix = `${attacker.name} が ${target.name} に「ショットガン」で攻撃！ `;
    const isHit = Math.random() < baseHitRate;

    if (!isHit) {
        broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 攻撃は外れた！（ミス）`);
        return;
    }

    let penetrateMsg = target.defenseCard ? ` (相手の防御カード「${target.defenseCard.card.name}」を貫通！)` : '';

    if (target.invincibleTurns && target.invincibleTurns > 0) {
        if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
        broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中！${penetrateMsg} しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！`);
        return;
    }

    if (target.steroidTurns && target.steroidTurns > 0) {
        target.steroidRevealed = true;
        broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中！${penetrateMsg} しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！`);
        return;
    }

    applyScoreChange(target, -3000);
    target.immunityCount = 2;
    broadcastGameState(logPrefix + `(成功率:${baseHitRate * 100}%) 命中ヒット！${penetrateMsg} 得点-3,000点！ (${target.name}は選択不可状態になりました)`);
}

// 標準攻撃（木の盾 / 木の剣 単体）
function executeStandardAttack(gameState, attackerId, targetId, cardId, broadcastGameState, skipIfImmuneToRound1CardEffect) {
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

// ダイヤの剣
function executeDiamondSword(gameState, casterSocketId, broadcastGameState, isImmuneToRound1CardEffect) {
    const caster = gameState.players[casterSocketId];
    if (!caster) return;

    const allPlayers = Object.values(gameState.players);
    const maxScore = Math.max(...allPlayers.map(p => p.score));
    const targetPlayers = allPlayers.filter(p => Math.abs(maxScore - p.score) <= 1000);
    const affectedLogs = [];

    targetPlayers.forEach(target => {
        if (target.id !== casterSocketId && isImmuneToRound1CardEffect(target.id, casterSocketId)) {
            affectedLogs.push(`${target.name}(1巡目効果無効)`);
            return;
        }

        const obanIndex = target.hand ? target.hand.findIndex(c => c.id === 'omamori_oban') : -1;
        const kobanSetIndex = target.hand ? target.hand.findIndex(c => c.id === 'omamori_koban_set') : -1;
        const kobanIndex = target.hand ? target.hand.findIndex(c => c.id === 'omamori_koban') : -1;

        if (obanIndex !== -1) {
            target.hand.splice(obanIndex, 1);
            applyScoreChange(target, 8000);
            affectedLogs.push(`${target.name}(「お守り大判」が身代わり発動！効果無効化＆+8,000点獲得)`);
            return;
        } else if (kobanSetIndex !== -1) {
            const kobanSet = target.hand[kobanSetIndex];
            if (!kobanSet.usesLeft) kobanSet.usesLeft = 3;
            kobanSet.usesLeft -= 1;
            applyScoreChange(target, 2000);

            let subMsg = kobanSet.usesLeft <= 0 ? (target.hand.splice(kobanSetIndex, 1), '・カード破棄') : `・残り${kobanSet.usesLeft}回`;
            affectedLogs.push(`${target.name}(「お守り小判セット」が身代わり発動！効果無効化＆+2,000点獲得${subMsg})`);
            return;
        } else if (kobanIndex !== -1) {
            target.hand.splice(kobanIndex, 1);
            applyScoreChange(target, 3000);
            affectedLogs.push(`${target.name}(「お守り小判」が身代わり発動！効果無効化＆+3,000点獲得)`);
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
            affectedLogs.push(`${target.name}(${stateName}ガード${defMsg ? '・' + defMsg : ''})`);
        } else {
            target.hand = [];
            target.defenseCard = null;
            applyScoreChange(target, -5000);
            target.immunityCount = 2;
            affectedLogs.push(`${target.name}(-5,000点・手札防御全破棄・選択不可2T)`);
        }
    });

    broadcastGameState(`${caster.name} が「ダイヤの剣」を発動！ (対象: ${affectedLogs.join(' / ')})`);
}

// 地震
function executeEarthquake(gameState, casterSocketId, io, broadcastGameState, isImmuneToRound1CardEffect) {
    const caster = gameState.players[casterSocketId];
    if (!caster) return;

    io.emit('showCutIn', { title: '地震発動！', imagePath: '/images/earthquake.png' });

    setTimeout(() => {
        const myScore = caster.score;
        const allPlayers = Object.values(gameState.players);
        const targets = allPlayers.filter(p => p.id !== casterSocketId && p.score >= myScore);

        if (targets.length === 0) {
            broadcastGameState(`${caster.name} が「地震」を発動しましたが、同点以上の相手が存在しないため不発に終わりました。`);
            return;
        }

        const affectedLogs = [];

        targets.forEach(target => {
            if (isImmuneToRound1CardEffect(target.id, casterSocketId)) {
                affectedLogs.push(`${target.name}(1巡目効果無効)`);
                return;
            }

            const isInvincible = target.invincibleTurns && target.invincibleTurns > 0;
            const isSteroid = target.steroidTurns && target.steroidTurns > 0;

            if (isInvincible || isSteroid) {
                if (isInvincible && target.invincibleSource === 'ARMOR') target.armorRevealed = true;
                if (isSteroid) target.steroidRevealed = true;
                const stateName = isInvincible ? '無敵' : 'ステロイド';
                affectedLogs.push(`${target.name}(${stateName}ガード)`);
                return;
            }

            const damage = Math.random() < 0.5 ? -1000 : -3000;
            applyScoreChange(target, damage);

            target.hand = [];
            target.defenseCard = null;
            target.immunityCount = 2;

            affectedLogs.push(`${target.name}(${damage.toLocaleString()}点・手札防御全破棄・選択不可2T)`);
        });

        broadcastGameState(`${caster.name} が「地震」を発動！ (対象: ${affectedLogs.join(' / ')})`);
    }, 2000);
}

// 大災害
function executeDisasterAttack(gameState, casterSocketId, io, broadcastGameState, isImmuneToRound1CardEffect) {
    const caster = gameState.players[casterSocketId];
    if (!caster) return;

    io.emit('showCutIn', { title: '大災害発動！', imagePath: '/images/disaster.png' });

    setTimeout(() => {
        const initialPlayers = Object.values(gameState.players).map(p => ({
            id: p.id,
            name: p.name,
            score: p.score
        }));

        const rankMap = {};
        initialPlayers.forEach(p => {
            const higherCount = initialPlayers.filter(other => other.score > p.score).length;
            rankMap[p.id] = higherCount + 1;
        });

        const damageByRank = { 1: -6000, 2: -4000, 3: -2000, 4: -1000 };

        Object.values(gameState.players).forEach(player => {
            if (player.id === casterSocketId || isImmuneToRound1CardEffect(player.id, casterSocketId)) return;

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

        broadcastGameState(`${caster.name} が「大災害」を発動！`);
    }, 2000);
}

// ダークマター
function executeDarkMatter(gameState, casterSocketId, broadcastGameState, isImmuneToRound1CardEffect) {
    const player = gameState.players[casterSocketId];
    if (!player) return;

    player.invincibleTurns = 1;
    player.invincibleSource = 'DARK_MATTER';

    const prevMyScore = player.score;
    applyScoreChange(player, 5000);
    const newMyScore = player.score;

    const penalizedNames = [];

    Object.values(gameState.players).forEach(opponent => {
        if (opponent.id === player.id || isImmuneToRound1CardEffect(opponent.id, casterSocketId)) return;

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

                penalizedNames.push(`${opponent.name}(成功)`);
            } else {
                penalizedNames.push(`${opponent.name}(不発)`);
            }
        }
    });

    let logMsg = `${player.name} が「ダークマター」を使用！ 無敵状態になり、+5,000点獲得！`;
    if (penalizedNames.length > 0) logMsg += ` 対象結果: ${penalizedNames.join(', ')}`;
    broadcastGameState(logMsg);
}

// 煙幕
function executeSmokeScreen(gameState, casterSocketId, broadcastGameState, isImmuneToRound1CardEffect) {
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
        if (p.score < myScore || isImmuneToRound1CardEffect(p.id, casterSocketId)) return false;
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
                affectedNames.push(`${target.name}(無効)`);
                return;
            }

            anySuccess = true;
            applyScoreChange(target, -1000);

            const rank = rankMap[target.id];
            const turns = (rank === 1) ? 2 : 1;
            target.darknessTurns = turns;

            affectedNames.push(`${target.name}(${turns}T)`);
        });

        const statusSuffix = anySuccess ? " (-1,000点 & 暗闇付与)" : "";
        broadcastGameState(`${caster.name} が「煙幕」を使用！ 対象: ${affectedNames.join(', ')}${statusSuffix}`);
    } else {
        const isInvincible = caster.invincibleTurns && caster.invincibleTurns > 0;
        const isSteroid = caster.steroidTurns && caster.steroidTurns > 0;

        if (isInvincible || isSteroid) {
            broadcastGameState(`${caster.name} が「煙幕」を使用！ 該当する相手がいないため自身に効果が跳ね返りましたが、無敵またはステロイド状態のため無効化されました。`);
            return;
        }

        applyScoreChange(caster, -1000);
        const myRank = rankMap[caster.id];
        const turns = (myRank === 1) ? 2 : 1;
        caster.darknessTurns = turns;

        broadcastGameState(`${caster.name} が「煙幕」を使用！ 該当する相手がいないため自身に効果発動 (-1,000点 & 暗闇${turns}ターン付与)`);
    }
}

// バフ解除時効果
function handleBuffExpire(gameState, player, buffType, isImmuneToRound1CardEffect) {
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
        if (opponent.id === player.id || isImmuneToRound1CardEffect(opponent.id, player.id)) return;

        const isInvincible = opponent.invincibleTurns && opponent.invincibleTurns > 0;
        const isImmune = opponent.immunityCount && opponent.immunityCount > 0;
        const isSteroid = opponent.steroidTurns && opponent.steroidTurns > 0;

        if (isInvincible || isImmune) return;
        if (buffType === 'STEROID' && isSteroid) return;

        const isConditionA = (opponent.score === prevMyScore);
        const isConditionB = (opponent.score > prevMyScore && newMyScore >= opponent.score);

        if (isConditionA || isConditionB) {
            const isSuccess = Math.random() < 0.5;

            if (isSuccess) {
                opponent.hand = [];
                opponent.defenseCard = null;
                applyScoreChange(opponent, -3000);
                opponent.immunityCount = 2;
                penalizedNames.push(`${opponent.name}(成功)`);
            } else {
                penalizedNames.push(`${opponent.name}(不発)`);
            }
        }
    });

    let logMsg = `${player.name} の「${cardName}」が解除され、+1,000点獲得！`;
    if (penalizedNames.length > 0) logMsg += ` ペナルティ結果: ${penalizedNames.join(', ')}`;
    return logMsg;
}

module.exports = {
    resetScoreChanges,
    applyScoreChange,
    isDefenseBlocked,
    getWoodShieldHitRate,
    getBronzeShieldLowerHitRate,
    executeGrenadeDefenseCounter,
    executeGrenadeSplash,
    executeGrenadeSingleAttack,
    executeGrenadeGroupAttack,
    executeBronzeShieldClosestAttack,
    executeBronzeShieldGroupAttack,
    executeBronzeShieldSetAttack,
    executeBronzeShieldSetGroupAttack,
    executeWoodShieldGroupAttack,
    executeShieldSetAttack,
    executeShieldSetGroupAttack,
    executeWoodSwordAttack,
    executeWoodSwordSetAttack,
    executeWoodSwordSetGroupAttack,
    executeShotgunAttack,
    executeStandardAttack,
    executeDiamondSword,
    executeEarthquake,
    executeDisasterAttack,
    executeDarkMatter,
    executeSmokeScreen,
    handleBuffExpire
};