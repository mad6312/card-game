/**
 * 銃撃・爆撃系攻撃カード実行モジュール (battle/attacks_gun.js)
 * ショットガン・グレネード（単体/グループ/スプラッシュ/カウンター）
 */

const { applyScoreChange } = require('./common');

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

/**
 * ショットガン（単体・グループ：射撃＆貫通カットイン完全同期）
 */
function executeShotgunAttack(gameState, attackerId, targetTypeOrId, io, broadcastGameState, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1, socket) {
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
            broadcastGameState(`${attacker.name} が「ショットガン」を使用しましたが、対象となる下位プレイヤーがいませんでした。`);
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

            let penetrateMsg = target.defenseCard ? ` (相手の防御カード「${target.defenseCard.card.name}」を貫通！)` : '';

            if (target.invincibleTurns && target.invincibleTurns > 0) {
                if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
                finalLog = `${attacker.name} の「ショットガン」攻撃 (対象: ${target.name})！ 命中！${penetrateMsg} しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！（攻撃終了）`;
                cutinResults.push({ targetId: target.id, result: 'INVINCIBLE' });
                stoppedEarly = true;
                break;
            }

            if (target.steroidTurns && target.steroidTurns > 0) {
                target.steroidRevealed = true;
                finalLog = `${attacker.name} の「ショットガン」攻撃 (対象: ${target.name})！ 命中！${penetrateMsg} しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！（攻撃終了）`;
                cutinResults.push({ targetId: target.id, result: 'STEROID' });
                stoppedEarly = true;
                break;
            }

            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            finalLog = `${attacker.name} の「ショットガン」攻撃 (対象: ${target.name})！ 命中ヒット！${penetrateMsg} 得点-3,000点！ (${target.name}は選択不可状態になりました。攻撃終了)`;

            if (target.defenseCard) {
                const defImg = target.defenseCard.card.image || '/images/wood_shield.png';
                cutinResults.push({ targetId: target.id, result: 'BLOCK_PIERCED', defCardImage: defImg });
            } else {
                cutinResults.push({ targetId: target.id, result: 'HIT' });
            }
            stoppedEarly = true;
            break;
        }

        if (!finalLog) {
            finalLog = `${attacker.name} の「ショットガン」攻撃は誰にも命中・無効化されず終了しました。`;
        }

        if (io) {
            io.emit('playAttackCutin', {
                attacker: {
                    id: attacker.id,
                    name: attacker.name,
                    avatar: attacker.avatar ? `/images/avatars/${attacker.avatar}.png` : '/images/avatars/avatar_default.png'
                },
                card: {
                    id: 'shotgun',
                    name: 'ショットガン',
                    image: '/images/shotgun.png'
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

    let cutinRes = 'HIT';
    let defImg = null;
    let finalLog = '';

    if (!isHit) {
        cutinRes = 'MISS';
        finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 攻撃は外れた！（ミス）`;
    } else {
        let penetrateMsg = target.defenseCard ? ` (相手の防御カード「${target.defenseCard.card.name}」を貫通！)` : '';

        if (target.invincibleTurns && target.invincibleTurns > 0) {
            if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 命中！${penetrateMsg} しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！`;
            cutinRes = 'INVINCIBLE';
        } else if (target.steroidTurns && target.steroidTurns > 0) {
            target.steroidRevealed = true;
            finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 命中！${penetrateMsg} しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！`;
            cutinRes = 'STEROID';
        } else {
            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 命中ヒット！${penetrateMsg} 得点-3,000点！ (${target.name}は選択不可状態になりました)`;

            if (target.defenseCard) {
                cutinRes = 'BLOCK_PIERCED';
                defImg = target.defenseCard.card.image || '/images/wood_shield.png';
            } else {
                cutinRes = 'HIT';
            }
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
                id: 'shotgun',
                name: 'ショットガン',
                image: '/images/shotgun.png'
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

module.exports = {
    executeGrenadeDefenseCounter,
    executeGrenadeSplash,
    executeGrenadeSingleAttack,
    executeGrenadeGroupAttack,
    executeShotgunAttack
};