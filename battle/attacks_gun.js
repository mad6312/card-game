/**
 * 銃撃・爆撃系攻撃カード実行モジュール (battle/attacks_gun.js)
 * ショットガン・グレネード（単体/グループ/スプラッシュ/カウンター）
 * ※ショットガン貫通時に対象のセット中防御カードを全公開する処理を追加
 */

const { applyScoreChange } = require('./common');
const { tryAutoTriggerDefense } = require('./triggers');

// グレネードカウンター処理
function executeGrenadeDefenseCounter(gameState, defenderId, broadcastGameState) {
    const defender = gameState.players[defenderId];
    if (!defender) return;

    const myScore = defender.score;
    const allPlayers = Object.values(gameState.players);
    const targets = allPlayers.filter(p => p.id !== defenderId && p.score <= myScore && (myScore - p.score) <= 1000);
    if (targets.length === 0) return;

    const counterLogs = [];
    const pendingDarkMatterResolvers = [];

    targets.forEach(target => {
        const autoRes = tryAutoTriggerDefense(gameState, target, {
            allowSteroid: true,
            broadcastGameState: broadcastGameState
        });

        if (autoRes && autoRes.resolveDarkMatterPenalty) {
            pendingDarkMatterResolvers.push(autoRes.resolveDarkMatterPenalty);
        }

        const isInvincible = target.invincibleTurns && target.invincibleTurns > 0;
        const isSteroid = target.steroidTurns && target.steroidTurns > 0;
        const isImmune = target.immunityCount && target.immunityCount > 0;

        if (autoRes || isInvincible || isSteroid || isImmune) {
            if (isInvincible && target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            if (isSteroid) target.steroidRevealed = true;

            let defMsg = '';
            if (target.defenseCard) {
                target.defenseCard = null;
                defMsg = '防御カード破棄';
            }
            const stateName = autoRes ? autoRes.stateName.replace('！', '') : (isInvincible ? '無敵' : (isSteroid ? 'ステロイド' : '選択不可'));
            const autoPrefix = autoRes ? `「${autoRes.cardName}」自動発動・` : '';
            counterLogs.push(`${target.name}(${autoPrefix}${stateName}ガード${defMsg ? '・' + defMsg : ''})`);
        } else {
            target.hand = [];
            target.defenseCard = null;
            applyScoreChange(target, -5000);
            target.immunityCount = 2;
            counterLogs.push(`${target.name}(-5,000点・手札防御全破棄・選択不可2T)`);
        }
    });

    pendingDarkMatterResolvers.forEach(resolver => {
        const res = resolver(gameState, null);
        if (res && res.penaltyLogSuffix) {
            counterLogs.push(res.penaltyLogSuffix);
        }
    });

    broadcastGameState(`💥 ${defender.name} の「グレネード」カウンター発動！ 反撃対象: ${counterLogs.join(' / ')}`);
}

// グレネード単体攻撃（放物線投擲＆同時大爆発カットイン完全同期）
function executeGrenadeSingleAttack(gameState, attackerId, targetId, io, broadcastGameState, isImmuneToRound1CardEffect, skipIfImmuneToRound1CardEffect, socket) {
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

    const centerScore = target.score;
    const allPlayers = Object.values(gameState.players);
    const splashOtherPlayers = allPlayers.filter(p => p.id !== attackerId && p.id !== target.id && Math.abs(p.score - centerScore) <= 1000);

    const defendersList = [];
    if (splashOtherPlayers.length === 0) {
        defendersList.push({ id: target.id, name: target.name, avatar: target.avatar ? `/images/avatars/${target.avatar}.png` : '/images/avatars/avatar_default.png' });
    } else if (splashOtherPlayers.length === 1) {
        defendersList.push({ id: target.id, name: target.name, avatar: target.avatar ? `/images/avatars/${target.avatar}.png` : '/images/avatars/avatar_default.png' });
        defendersList.push({ id: splashOtherPlayers[0].id, name: splashOtherPlayers[0].name, avatar: splashOtherPlayers[0].avatar ? `/images/avatars/${splashOtherPlayers[0].avatar}.png` : '/images/avatars/avatar_default.png' });
    } else {
        defendersList.push({ id: splashOtherPlayers[0].id, name: splashOtherPlayers[0].name, avatar: splashOtherPlayers[0].avatar ? `/images/avatars/${splashOtherPlayers[0].avatar}.png` : '/images/avatars/avatar_default.png' });
        defendersList.push({ id: target.id, name: target.name, avatar: target.avatar ? `/images/avatars/${target.avatar}.png` : '/images/avatars/avatar_default.png' });
        defendersList.push({ id: splashOtherPlayers[1].id, name: splashOtherPlayers[1].name, avatar: splashOtherPlayers[1].avatar ? `/images/avatars/${splashOtherPlayers[1].avatar}.png` : '/images/avatars/avatar_default.png' });
    }

    const victimsData = [];
    const affectedLogs = [];
    const pendingDarkMatterResolvers = [];

    if (isHit) {
        const allVictims = allPlayers.filter(p => Math.abs(p.score - centerScore) <= 1000);

        allVictims.forEach(victim => {
            if (victim.id !== attackerId && isImmuneToRound1CardEffect(victim.id, attackerId)) {
                affectedLogs.push(`${victim.name}(1巡目効果無効)`);
                return;
            }

            const autoRes = tryAutoTriggerDefense(gameState, victim, {
                allowSteroid: true,
                isImmuneToRound1CardEffect: isImmuneToRound1CardEffect,
                broadcastGameState: broadcastGameState
            });

            if (autoRes && autoRes.resolveDarkMatterPenalty) {
                pendingDarkMatterResolvers.push(autoRes.resolveDarkMatterPenalty);
            }

            const isInvincible = victim.invincibleTurns && victim.invincibleTurns > 0;
            const isSteroid = victim.steroidTurns && victim.steroidTurns > 0;
            const isImmune = victim.immunityCount && victim.immunityCount > 0;

            if (autoRes || isInvincible || isSteroid || isImmune) {
                if (isInvincible && victim.invincibleSource === 'ARMOR') victim.armorRevealed = true;
                if (isSteroid) victim.steroidRevealed = true;

                let defMsg = '';
                const hadDef = autoRes ? autoRes.hadDefense : !!victim.defenseCard;
                if (victim.defenseCard) {
                    victim.defenseCard = null;
                    defMsg = '防御カード破棄';
                }
                const stateName = autoRes ? autoRes.stateName : (isInvincible ? '無敵！' : (isSteroid ? 'ステロイド！' : '選択不可！'));
                const autoPrefix = autoRes ? `「${autoRes.cardName}」自動発動・` : '';
                affectedLogs.push(`${victim.name}(${autoPrefix}${stateName.replace('！', '')}ガード${defMsg ? '・' + defMsg : ''})`);

                victimsData.push({
                    id: victim.id,
                    result: 'PROTECTED',
                    protectText: stateName,
                    hasDefenseCard: hadDef
                });
            } else {
                let hadDef = false;
                let defImg = null;
                if (victim.defenseCard) {
                    hadDef = true;
                    defImg = victim.defenseCard.card.image || '/images/wood_shield.png';
                }
                victim.hand = [];
                victim.defenseCard = null;
                applyScoreChange(victim, -5000);
                victim.immunityCount = 2;
                affectedLogs.push(`${victim.name}(-5,000点・手札防御全破棄・選択不可2T)`);

                victimsData.push({
                    id: victim.id,
                    result: (victim.id === target.id && hadDef) ? 'BLOCK_PIERCED' : 'HIT',
                    defCardImage: defImg
                });
            }
        });

        const pendingDarkMatterCutins = [];
        pendingDarkMatterResolvers.forEach(resolver => {
            const res = resolver(gameState, io);
            if (res) {
                if (res.penaltyLogSuffix) affectedLogs.push(res.penaltyLogSuffix);
                if (res.darkMatterCutinData) pendingDarkMatterCutins.push(res.darkMatterCutinData);
            }
        });

        if (io) {
            io.emit('playAttackCutin', {
                attacker: {
                    id: attacker.id,
                    name: attacker.name,
                    avatar: attacker.avatar ? `/images/avatars/${attacker.avatar}.png` : '/images/avatars/avatar_default.png'
                },
                card: {
                    id: 'grenade',
                    name: 'グレネード',
                    image: '/images/grenade.png'
                },
                defenders: defendersList,
                grenadeAction: {
                    steps: [{
                        primaryTargetId: target.id,
                        isMiss: !isHit,
                        victims: victimsData
                    }]
                }
            });

            pendingDarkMatterCutins.forEach(dmCutin => {
                io.emit('playAttackCutin', dmCutin);
            });
        }

        const totalDuration = pendingDarkMatterCutins.length > 0 ? (1600 + 1400 * pendingDarkMatterCutins.length) : 1600;
        setTimeout(() => {
            let penetrateMsg = target.defenseCard ? ` (相手の防御カードを貫通！)` : '';
            broadcastGameState(logPrefix + `(命中率:${baseHitRate * 100}%) 命中着弾！${penetrateMsg}\n💥 グレネード爆発！ 誘爆対象: ${affectedLogs.join(' / ')}`);
        }, totalDuration);
        return;
    }

    if (io) {
        io.emit('playAttackCutin', {
            attacker: {
                id: attacker.id,
                name: attacker.name,
                avatar: attacker.avatar ? `/images/avatars/${attacker.avatar}.png` : '/images/avatars/avatar_default.png'
            },
            card: {
                id: 'grenade',
                name: 'グレネード',
                image: '/images/grenade.png'
            },
            defenders: defendersList,
            grenadeAction: {
                steps: [{
                    primaryTargetId: target.id,
                    isMiss: true,
                    victims: []
                }]
            }
        });
    }

    setTimeout(() => {
        broadcastGameState(logPrefix + `(命中率:${baseHitRate * 100}%) 攻撃は外れた！（ミス）`);
    }, 1200);
}

// グレネードグループ攻撃（下位全員：順次投擲＆同時大爆発カットイン完全同期）
function executeGrenadeGroupAttack(gameState, attackerId, io, broadcastGameState, isImmuneToRound1CardEffect, skipIfImmuneToRound1CardEffect, cannotSelectAsAttackTargetInRound1) {
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

    let baseHitRate = 0.8;
    if (attacker.darknessTurns && attacker.darknessTurns > 0) baseHitRate = 0.4;

    const steps = [];
    let finalLog = '';
    let stopped = false;
    const pendingDarkMatterResolvers = [];

    for (let i = 0; i < attackQueue.length; i++) {
        if (stopped) break;

        const target = gameState.players[attackQueue[i].id];
        if (!target) continue;

        const isHit = Math.random() < baseHitRate;

        if (!isHit) {
            steps.push({
                primaryTargetId: target.id,
                isMiss: true,
                victims: []
            });
            continue;
        }

        const centerScore = target.score;
        const allVictims = allPlayers.filter(p => Math.abs(p.score - centerScore) <= 1000);
        const victimsData = [];
        const affectedLogs = [];

        allVictims.forEach(victim => {
            if (victim.id !== attackerId && isImmuneToRound1CardEffect(victim.id, attackerId)) {
                affectedLogs.push(`${victim.name}(1巡目効果無効)`);
                return;
            }

            const autoRes = tryAutoTriggerDefense(gameState, victim, {
                allowSteroid: true,
                isImmuneToRound1CardEffect: isImmuneToRound1CardEffect,
                broadcastGameState: broadcastGameState
            });

            if (autoRes && autoRes.resolveDarkMatterPenalty) {
                pendingDarkMatterResolvers.push(autoRes.resolveDarkMatterPenalty);
            }

            const isInvincible = victim.invincibleTurns && victim.invincibleTurns > 0;
            const isSteroid = victim.steroidTurns && victim.steroidTurns > 0;
            const isImmune = victim.immunityCount && victim.immunityCount > 0;

            if (autoRes || isInvincible || isSteroid || isImmune) {
                if (isInvincible && victim.invincibleSource === 'ARMOR') victim.armorRevealed = true;
                if (isSteroid) victim.steroidRevealed = true;

                let defMsg = '';
                const hadDef = autoRes ? autoRes.hadDefense : !!victim.defenseCard;
                if (victim.defenseCard) {
                    victim.defenseCard = null;
                    defMsg = '防御カード破棄';
                }
                const stateName = autoRes ? autoRes.stateName : (isInvincible ? '無敵！' : (isSteroid ? 'ステロイド！' : '選択不可！'));
                const autoPrefix = autoRes ? `「${autoRes.cardName}」自動発動・` : '';
                affectedLogs.push(`${victim.name}(${autoPrefix}${stateName.replace('！', '')}ガード${defMsg ? '・' + defMsg : ''})`);

                victimsData.push({
                    id: victim.id,
                    result: 'PROTECTED',
                    protectText: stateName,
                    hasDefenseCard: hadDef
                });
            } else {
                let hadDef = false;
                let defImg = null;
                if (victim.defenseCard) {
                    hadDef = true;
                    defImg = victim.defenseCard.card.image || '/images/wood_shield.png';
                }
                victim.hand = [];
                victim.defenseCard = null;
                applyScoreChange(victim, -5000);
                victim.immunityCount = 2;
                affectedLogs.push(`${victim.name}(-5,000点・手札防御全破棄・選択不可2T)`);

                victimsData.push({
                    id: victim.id,
                    result: (victim.id === target.id && hadDef) ? 'BLOCK_PIERCED' : 'HIT',
                    defCardImage: defImg
                });
            }
        });

        const pendingDarkMatterCutins = [];
        pendingDarkMatterResolvers.forEach(resolver => {
            const res = resolver(gameState, io);
            if (res) {
                if (res.penaltyLogSuffix) affectedLogs.push(res.penaltyLogSuffix);
                if (res.darkMatterCutinData) pendingDarkMatterCutins.push(res.darkMatterCutinData);
            }
        });

        steps.push({
            primaryTargetId: target.id,
            isMiss: false,
            victims: victimsData
        });

        let penetrateMsg = target.defenseCard ? ` (相手の防御カードを貫通！)` : '';
        finalLog = `${attacker.name} の「グレネード」攻撃 (対象: ${target.name})！ (命中率:${Math.round(baseHitRate * 100)}%) 命中着弾！${penetrateMsg}\n💥 グレネード爆発！ 誘爆対象: ${affectedLogs.join(' / ')}`;
        stopped = true;

        if (io) {
            io.emit('playAttackCutin', {
                attacker: {
                    id: attacker.id,
                    name: attacker.name,
                    avatar: attacker.avatar ? `/images/avatars/${attacker.avatar}.png` : '/images/avatars/avatar_default.png'
                },
                card: {
                    id: 'grenade',
                    name: 'グレネード',
                    image: '/images/grenade.png'
                },
                defenders: defendersList,
                grenadeAction: {
                    steps: steps
                }
            });

            pendingDarkMatterCutins.forEach(dmCutin => {
                io.emit('playAttackCutin', dmCutin);
            });
        }

        const baseDuration = Math.max(1200, steps.length * 600 + 1000);
        const animDuration = pendingDarkMatterCutin ? (baseDuration + 1400 * pendingDarkMatterCutin.length) : baseDuration;
        setTimeout(() => {
            broadcastGameState(finalLog);
        }, animDuration);
        return;
    }

    if (!finalLog) {
        finalLog = `${attacker.name} の「グレネード」攻撃は誰にも命中せず終了しました。`;
    }

    if (io) {
        io.emit('playAttackCutin', {
            attacker: {
                id: attacker.id,
                name: attacker.name,
                avatar: attacker.avatar ? `/images/avatars/${attacker.avatar}.png` : '/images/avatars/avatar_default.png'
            },
            card: {
                id: 'grenade',
                name: 'グレネード',
                image: '/images/grenade.png'
            },
            defenders: defendersList,
            grenadeAction: {
                steps: steps
            }
        });
    }

    const animDuration = Math.max(1200, steps.length * 600 + 1000);
    setTimeout(() => {
        broadcastGameState(finalLog);
    }, animDuration);
}

// ショットガン（単体・グループ：貫通時に相手の防御カードを全公開する仕様対応）
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

            let penetrateMsg = target.defenseCard ? ` (相手の防御カード「${target.defenseCard.card.name}」を貫通！)` : '';

            const autoRes = tryAutoTriggerDefense(gameState, target, {
                allowSteroid: true,
                isImmuneToRound1CardEffect: skipIfImmuneToRound1CardEffect,
                broadcastGameState: broadcastGameState
            });

            if (autoRes) {
                cutinResults.push({ targetId: target.id, result: autoRes.cardId === 'steroid' ? 'STEROID' : 'INVINCIBLE' });
                finalLog = `${attacker.name} の「ショットガン」攻撃 (対象: ${target.name})！ 命中！${penetrateMsg} しかし ${target.name} の手札から「${autoRes.cardName}」が自動発動！攻撃が無効化されました！（攻撃終了）\n(${autoRes.logMsg})`;
                if (autoRes.resolveDarkMatterPenalty) {
                    const dmRes = autoRes.resolveDarkMatterPenalty(gameState, io);
                    if (dmRes && dmRes.darkMatterCutinData) {
                        pendingDarkMatterCutin = dmRes.darkMatterCutinData;
                    }
                }
                stoppedEarly = true;
                break;
            }

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

            // ★貫通発生時：対象が防御カードをセットしていれば、非公開設定でも全公開（revealed = true）にする
            if (target.defenseCard) {
                target.defenseCard.revealed = true;
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
    let pendingDarkMatterCutin = null;

    if (!isHit) {
        cutinRes = 'MISS';
        finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 攻撃は外れた！（ミス）`;
    } else {
        let penetrateMsg = target.defenseCard ? ` (相手の防御カード「${target.defenseCard.card.name}」を貫通！)` : '';

        const autoRes = tryAutoTriggerDefense(gameState, target, {
            allowSteroid: true,
            isImmuneToRound1CardEffect: skipIfImmuneToRound1CardEffect,
            broadcastGameState: broadcastGameState
        });

        if (autoRes) {
            cutinRes = autoRes.cardId === 'steroid' ? 'STEROID' : 'INVINCIBLE';
            finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 命中！${penetrateMsg} しかし ${target.name} の手札から「${autoRes.cardName}」が自動発動！攻撃が無効化されました！\n(${autoRes.logMsg})`;
            if (autoRes.resolveDarkMatterPenalty) {
                const dmRes = autoRes.resolveDarkMatterPenalty(gameState, io);
                if (dmRes && dmRes.darkMatterCutinData) {
                    pendingDarkMatterCutin = dmRes.darkMatterCutinData;
                }
            }
        } else if (target.invincibleTurns && target.invincibleTurns > 0) {
            if (target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 命中！${penetrateMsg} しかし ${target.name} は「無敵状態」のため攻撃が無効化されました！`;
            cutinRes = 'INVINCIBLE';
        } else if (target.steroidTurns && target.steroidTurns > 0) {
            target.steroidRevealed = true;
            finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 命中！${penetrateMsg} しかし ${target.name} は「ステロイド状態」のため攻撃が無効化されました！`;
            cutinRes = 'STEROID';
        } else {
            // ★貫通発生時：対象が防御カードをセットしていれば、非公開設定でも全公開（revealed = true）にする
            if (target.defenseCard) {
                target.defenseCard.revealed = true;
                cutinRes = 'BLOCK_PIERCED';
                defImg = target.defenseCard.card.image || '/images/wood_shield.png';
            } else {
                cutinRes = 'HIT';
            }

            applyScoreChange(target, -3000);
            target.immunityCount = 2;
            finalLog = logPrefix + `(成功率:${baseHitRate * 100}%) 命中ヒット！${penetrateMsg} 得点-3,000点！ (${target.name}は選択不可状態になりました)`;
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

        if (pendingDarkMatterCutin) {
            io.emit('playAttackCutin', pendingDarkMatterCutin);
        }
    }

    const duration = pendingDarkMatterCutin ? 2800 : 1400;
    setTimeout(() => {
        broadcastGameState(finalLog);
    }, duration);
}

module.exports = {
    executeGrenadeDefenseCounter,
    executeGrenadeSingleAttack,
    executeGrenadeGroupAttack,
    executeShotgunAttack
};