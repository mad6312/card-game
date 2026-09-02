/**
 * 特殊効果・範囲攻撃・バフ解除実行モジュール (battle/specials.js)
 * ダイヤの剣・地震・大災害・ダークマター・煙幕・バフ解除処理
 */

const { applyScoreChange } = require('./common');
const { tryAutoTriggerDefense } = require('./triggers');

// ダイヤの剣（天空刺突＆クリスタル大爆発カットイン完全同期）
function executeDiamondSword(gameState, casterSocketId, io, broadcastGameState, isImmuneToRound1CardEffect) {
    const caster = gameState.players[casterSocketId];
    if (!caster) return;

    const allPlayers = Object.values(gameState.players);
    const maxScore = Math.max(...allPlayers.map(p => p.score));

    // 1位の中で基準となる本ターゲットの選定
    const topPlayers = allPlayers.filter(p => p.score === maxScore);
    const primaryTarget = topPlayers[0];

    // 本ターゲットと±1,000点以内の対象者全員（1位含む）
    const targetPlayers = allPlayers.filter(p => Math.abs(maxScore - p.score) <= 1000);
    const splashOthers = targetPlayers.filter(p => p.id !== primaryTarget.id);

    // スプラッシュ人数に応じた中央整列リストの構築
    const defendersList = [];
    if (splashOthers.length === 0) {
        defendersList.push({ id: primaryTarget.id, name: primaryTarget.name, avatar: primaryTarget.avatar ? `/images/avatars/${primaryTarget.avatar}.png` : '/images/avatars/avatar_default.png' });
    } else if (splashOthers.length === 1) {
        defendersList.push({ id: primaryTarget.id, name: primaryTarget.name, avatar: primaryTarget.avatar ? `/images/avatars/${primaryTarget.avatar}.png` : '/images/avatars/avatar_default.png' });
        defendersList.push({ id: splashOthers[0].id, name: splashOthers[0].name, avatar: splashOthers[0].avatar ? `/images/avatars/${splashOthers[0].avatar}.png` : '/images/avatars/avatar_default.png' });
    } else if (splashOthers.length === 2) {
        defendersList.push({ id: splashOthers[0].id, name: splashOthers[0].name, avatar: splashOthers[0].avatar ? `/images/avatars/${splashOthers[0].avatar}.png` : '/images/avatars/avatar_default.png' });
        defendersList.push({ id: primaryTarget.id, name: primaryTarget.name, avatar: primaryTarget.avatar ? `/images/avatars/${primaryTarget.avatar}.png` : '/images/avatars/avatar_default.png' });
        defendersList.push({ id: splashOthers[1].id, name: splashOthers[1].name, avatar: splashOthers[1].avatar ? `/images/avatars/${splashOthers[1].avatar}.png` : '/images/avatars/avatar_default.png' });
    } else {
        defendersList.push({ id: splashOthers[0].id, name: splashOthers[0].name, avatar: splashOthers[0].avatar ? `/images/avatars/${splashOthers[0].avatar}.png` : '/images/avatars/avatar_default.png' });
        defendersList.push({ id: splashOthers[1].id, name: splashOthers[1].name, avatar: splashOthers[1].avatar ? `/images/avatars/${splashOthers[1].avatar}.png` : '/images/avatars/avatar_default.png' });
        defendersList.push({ id: primaryTarget.id, name: primaryTarget.name, avatar: primaryTarget.avatar ? `/images/avatars/${primaryTarget.avatar}.png` : '/images/avatars/avatar_default.png' });
        defendersList.push({ id: splashOthers[2].id, name: splashOthers[2].name, avatar: splashOthers[2].avatar ? `/images/avatars/${splashOthers[2].avatar}.png` : '/images/avatars/avatar_default.png' });
    }

    const victimsData = [];
    const affectedLogs = [];
    const pendingDarkMatterResolvers = [];

    // 1. まずダイヤの剣の全被弾処理を実行
    targetPlayers.forEach(target => {
        if (target.id !== casterSocketId && isImmuneToRound1CardEffect(target.id, casterSocketId)) {
            affectedLogs.push(`${target.name}(1巡目効果無効)`);
            return;
        }

        const isInvincible = target.invincibleTurns && target.invincibleTurns > 0;
        const isSteroid = target.steroidTurns && target.steroidTurns > 0;
        const isImmune = target.immunityCount && target.immunityCount > 0;

        // 1. すでに「無敵状態」「ステロイド状態」「選択不可状態」の場合（お守りは温存）
        if (isInvincible || isSteroid || isImmune) {
            if (isInvincible && target.invincibleSource === 'ARMOR') target.armorRevealed = true;
            if (isSteroid) target.steroidRevealed = true;

            let defMsg = '';
            const hadDef = !!target.defenseCard;
            if (target.defenseCard) {
                target.defenseCard = null;
                defMsg = '防御カード破棄';
            }
            const stateName = isInvincible ? '無敵！' : (isSteroid ? 'ステロイド！' : '選択不可！');
            affectedLogs.push(`${target.name}(${stateName.replace('！', '')}ガード${defMsg ? '・' + defMsg : ''})`);

            victimsData.push({
                id: target.id,
                result: 'PROTECTED',
                protectText: stateName,
                hasDefenseCard: hadDef
            });
            return;
        }

        // 2. お守り系カードの自動消費（セット中防御カード全破棄）
        const obanIndex = target.hand ? target.hand.findIndex(c => c.id === 'omamori_oban') : -1;
        const kobanSetIndex = target.hand ? target.hand.findIndex(c => c.id === 'omamori_koban_set') : -1;
        const kobanIndex = target.hand ? target.hand.findIndex(c => c.id === 'omamori_koban') : -1;

        if (obanIndex !== -1) {
            target.hand.splice(obanIndex, 1);
            const hadDef = !!target.defenseCard;
            target.defenseCard = null;
            applyScoreChange(target, 8000);
            affectedLogs.push(`${target.name}(「お守り大判」が身代わり発動！効果無効化＆+8,000点獲得${hadDef ? '・防御カード破棄' : ''})`);
            victimsData.push({ id: target.id, result: 'DODGE', hasDefenseCard: hadDef });
            return;
        } else if (kobanSetIndex !== -1) {
            const kobanSet = target.hand[kobanSetIndex];
            if (!kobanSet.usesLeft) kobanSet.usesLeft = 3;
            kobanSet.usesLeft -= 1;
            const hadDef = !!target.defenseCard;
            target.defenseCard = null;
            applyScoreChange(target, 2000);

            let subMsg = kobanSet.usesLeft <= 0 ? (target.hand.splice(kobanSetIndex, 1), '・カード破棄') : `・残り${kobanSet.usesLeft}回`;
            affectedLogs.push(`${target.name}(「お守り小判セット」が身代わり発動！効果無効化＆+2,000点獲得${subMsg}${hadDef ? '・防御カード破棄' : ''})`);
            victimsData.push({ id: target.id, result: 'DODGE', hasDefenseCard: hadDef });
            return;
        } else if (kobanIndex !== -1) {
            target.hand.splice(kobanIndex, 1);
            const hadDef = !!target.defenseCard;
            target.defenseCard = null;
            applyScoreChange(target, 3000);
            affectedLogs.push(`${target.name}(「お守り小判」が身代わり発動！効果無効化＆+3,000点獲得${hadDef ? '・防御カード破棄' : ''})`);
            victimsData.push({ id: target.id, result: 'DODGE', hasDefenseCard: hadDef });
            return;
        }

        // 3. お守りがない場合：ステロイド/無敵アーマー/ダークマターの手札自動発動チェック
        const autoRes = tryAutoTriggerDefense(gameState, target, {
            allowSteroid: true,
            isImmuneToRound1CardEffect: isImmuneToRound1CardEffect,
            broadcastGameState: broadcastGameState
        });

        if (autoRes && autoRes.resolveDarkMatterPenalty) {
            pendingDarkMatterResolvers.push(autoRes.resolveDarkMatterPenalty);
        }

        if (autoRes) {
            let defMsg = autoRes.hadDefense ? '・防御カード破棄' : '';
            affectedLogs.push(`${target.name}(「${autoRes.cardName}」自動発動・${autoRes.stateName.replace('！', '')}ガード${defMsg})`);

            victimsData.push({
                id: target.id,
                result: 'PROTECTED',
                protectText: autoRes.stateName,
                hasDefenseCard: autoRes.hadDefense
            });
        } else {
            const hadDef = !!target.defenseCard;
            target.hand = [];
            target.defenseCard = null;
            applyScoreChange(target, -5000);
            target.immunityCount = 2;
            affectedLogs.push(`${target.name}(-5,000点・手札防御全破棄・選択不可2T)`);

            victimsData.push({
                id: target.id,
                result: 'HIT',
                hasDefenseCard: hadDef
            });
        }
    });

    // 2. ダイヤの剣処理完了後にダークマターペナルティを遅延解決
    const pendingDarkMatterCutins = [];
    pendingDarkMatterResolvers.forEach(resolver => {
        const res = resolver(gameState, io);
        if (res) {
            if (res.penaltyLogSuffix) affectedLogs.push(res.penaltyLogSuffix);
            if (res.darkMatterCutinData) pendingDarkMatterCutins.push(res.darkMatterCutinData);
        }
    });

    if (io) {
        // 1. ダイヤの剣カットイン
        io.emit('playAttackCutin', {
            attacker: {
                id: caster.id,
                name: caster.name,
                avatar: caster.avatar ? `/images/avatars/${caster.avatar}.png` : '/images/avatars/avatar_default.png'
            },
            card: {
                id: 'diamond_sword',
                name: 'ダイヤの剣',
                image: '/images/diamond_sword.png'
            },
            defenders: defendersList,
            diamondSwordAction: {
                primaryTargetId: primaryTarget.id,
                victims: victimsData
            }
        });

        // 2. ダークマターカットイン
        pendingDarkMatterCutins.forEach(dmCutin => {
            io.emit('playAttackCutin', dmCutin);
        });
    }

    const duration = pendingDarkMatterCutins.length > 0 ? 3200 : 1800;
    setTimeout(() => {
        broadcastGameState(`${caster.name} が「ダイヤの剣」を発動！ (対象: ${affectedLogs.join(' / ')})`);
    }, duration);
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
        const pendingDarkMatterResolvers = [];

        // 1. まず地震の全被弾処理を実行
        targets.forEach(target => {
            if (isImmuneToRound1CardEffect(target.id, casterSocketId)) {
                affectedLogs.push(`${target.name}(1巡目効果無効)`);
                return;
            }

            const autoRes = tryAutoTriggerDefense(gameState, target, {
                allowSteroid: true,
                isImmuneToRound1CardEffect: isImmuneToRound1CardEffect,
                broadcastGameState: broadcastGameState
            });

            if (autoRes && autoRes.resolveDarkMatterPenalty) {
                pendingDarkMatterResolvers.push(autoRes.resolveDarkMatterPenalty);
            }

            const isInvincible = target.invincibleTurns && target.invincibleTurns > 0;
            const isSteroid = target.steroidTurns && target.steroidTurns > 0;

            if (autoRes || isInvincible || isSteroid) {
                if (isInvincible && target.invincibleSource === 'ARMOR') target.armorRevealed = true;
                if (isSteroid) target.steroidRevealed = true;
                const stateName = autoRes ? autoRes.stateName.replace('！', '') : (isInvincible ? '無敵' : 'ステロイド');
                const autoPrefix = autoRes ? `「${autoRes.cardName}」自動発動・` : '';
                affectedLogs.push(`${target.name}(${autoPrefix}${stateName}ガード)`);
                return;
            }

            const damage = Math.random() < 0.5 ? -1000 : -3000;
            applyScoreChange(target, damage);

            target.hand = [];
            target.defenseCard = null;
            target.immunityCount = 2;

            affectedLogs.push(`${target.name}(${damage.toLocaleString()}点・手札防御全破棄・選択不可2T)`);
        });

        // 2. 地震処理完了後にダークマターペナルティを遅延解決
        const pendingDarkMatterCutins = [];
        pendingDarkMatterResolvers.forEach(resolver => {
            const res = resolver(gameState, io);
            if (res) {
                if (res.penaltyLogSuffix) affectedLogs.push(res.penaltyLogSuffix);
                if (res.darkMatterCutinData) pendingDarkMatterCutins.push(res.darkMatterCutinData);
            }
        });

        if (io) {
            pendingDarkMatterCutins.forEach(dmCutin => {
                io.emit('playAttackCutin', dmCutin);
            });
        }

        const duration = pendingDarkMatterCutins.length > 0 ? 1400 : 0;
        setTimeout(() => {
            broadcastGameState(`${caster.name} が「地震」を発動！ (対象: ${affectedLogs.join(' / ')})`);
        }, duration);
    }, 2000);
}

// 大災害（※仕様により手札自動発動の対象外）
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

// ダークマター（闇の広域爆発カットイン完全同期・選択不可除外対応）
function executeDarkMatter(gameState, casterSocketId, io, broadcastGameState, isImmuneToRound1CardEffect) {
    const player = gameState.players[casterSocketId];
    if (!player) return;

    player.invincibleTurns = 1;
    player.invincibleSource = 'DARK_MATTER';

    const prevMyScore = player.score;
    applyScoreChange(player, 5000);
    const newMyScore = player.score;

    const allPlayers = Object.values(gameState.players);
    const penaltyCandidates = allPlayers.filter(opponent => {
        if (opponent.id === player.id || isImmuneToRound1CardEffect(opponent.id, casterSocketId)) return false;
        const isConditionA = (opponent.score === prevMyScore);
        const isConditionB = (opponent.score > prevMyScore && newMyScore >= opponent.score);
        return isConditionA || isConditionB;
    });

    const penalizedNames = [];
    const defendersList = [];
    const victimsData = [];

    penaltyCandidates.forEach(opponent => {
        const isAlreadyImmune = opponent.immunityCount && opponent.immunityCount > 0;
        // 選択不可状態のプレイヤーはカットイン演出自体から除外
        if (isAlreadyImmune) {
            penalizedNames.push(`${opponent.name}(選択不可ガード)`);
            return;
        }

        defendersList.push({
            id: opponent.id,
            name: opponent.name,
            avatar: opponent.avatar ? `/images/avatars/${opponent.avatar}.png` : '/images/avatars/avatar_default.png'
        });

        const isAlreadyInvincible = opponent.invincibleTurns && opponent.invincibleTurns > 0;
        if (isAlreadyInvincible) {
            victimsData.push({
                id: opponent.id,
                result: 'PROTECTED',
                protectText: '無敵！',
                hasDefenseCard: !!opponent.defenseCard
            });
            penalizedNames.push(`${opponent.name}(無敵ガード)`);
            return;
        }

        // 1. 50%不発判定
        const isSuccess = Math.random() < 0.5;
        if (!isSuccess) {
            victimsData.push({
                id: opponent.id,
                result: 'MISS',
                hasDefenseCard: !!opponent.defenseCard
            });
            penalizedNames.push(`${opponent.name}(不発)`);
            return;
        }

        // 2. ペナルティ発生確定時：相手の手札カウンター判定（ステロイドは無効化不可）
        const autoRes = tryAutoTriggerDefense(gameState, opponent, {
            allowSteroid: false,
            isImmuneToRound1CardEffect: isImmuneToRound1CardEffect,
            broadcastGameState: broadcastGameState
        });

        if (autoRes && autoRes.canBlock) {
            victimsData.push({
                id: opponent.id,
                result: 'PROTECTED',
                protectText: autoRes.stateName,
                hasDefenseCard: autoRes.hadDefense
            });
            penalizedNames.push(`${opponent.name}(「${autoRes.cardName}」自動発動ガード)`);
            return;
        }

        // 3. ペナルティ直撃
        const hadDef = autoRes ? autoRes.hadDefense : !!opponent.defenseCard;
        opponent.hand = [];
        opponent.defenseCard = null;
        applyScoreChange(opponent, -3000);
        opponent.immunityCount = 2;

        const steroidNotice = (autoRes && !autoRes.canBlock) ? '(「ステロイド」自動消費・ペナルティ直撃)' : '(成功)';
        penalizedNames.push(`${opponent.name}${steroidNotice}`);

        victimsData.push({
            id: opponent.id,
            result: 'HIT',
            hasDefenseCard: hadDef
        });
    });

    let logMsg = `${player.name} が「ダークマター」を使用！ 無敵状態になり、+5,000点獲得！`;
    if (penalizedNames.length > 0) logMsg += ` 対象結果: ${penalizedNames.join(', ')}`;

    if (defendersList.length > 0 && io) {
        io.emit('playAttackCutin', {
            attacker: {
                id: player.id,
                name: player.name,
                avatar: player.avatar ? `/images/avatars/${player.avatar}.png` : '/images/avatars/avatar_default.png'
            },
            card: {
                id: 'dark_matter',
                name: 'ダークマター',
                image: '/images/dark_matter.png'
            },
            defenders: defendersList,
            darkMatterAction: {
                victims: victimsData
            }
        });

        setTimeout(() => {
            broadcastGameState(logMsg);
        }, 1600);
    } else {
        broadcastGameState(logMsg);
    }
}

// 煙幕（※仕様により手札自動発動の対象外）
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
function handleBuffExpire(gameState, player, buffType, isImmuneToRound1CardEffect, io) {
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
    const pendingDarkMatterResolvers = [];

    Object.values(gameState.players).forEach(opponent => {
        if (opponent.id === player.id || isImmuneToRound1CardEffect(opponent.id, player.id)) return;

        const isConditionA = (opponent.score === prevMyScore);
        const isConditionB = (opponent.score > prevMyScore && newMyScore >= opponent.score);

        if (isConditionA || isConditionB) {
            const isAlreadyInvincible = opponent.invincibleTurns && opponent.invincibleTurns > 0;
            const isAlreadyImmune = opponent.immunityCount && opponent.immunityCount > 0;
            const isAlreadySteroid = opponent.steroidTurns && opponent.steroidTurns > 0;

            if (isAlreadyInvincible || isAlreadyImmune) return;
            if (buffType === 'STEROID' && isAlreadySteroid) return;

            // 1. 50%不発判定
            const isSuccess = Math.random() < 0.5;
            if (!isSuccess) {
                penalizedNames.push(`${opponent.name}(不発)`);
                return;
            }

            // 2. ペナルティ発生確定時：相手の手札カウンター判定（ステロイドは無効化不可）
            const autoRes = tryAutoTriggerDefense(gameState, opponent, {
                allowSteroid: false,
                isImmuneToRound1CardEffect: isImmuneToRound1CardEffect
            });

            if (autoRes && autoRes.resolveDarkMatterPenalty) {
                pendingDarkMatterResolvers.push(autoRes.resolveDarkMatterPenalty);
            }

            if (autoRes && autoRes.canBlock) {
                penalizedNames.push(`${opponent.name}(「${autoRes.cardName}」自動発動ガード)`);
                return;
            }

            // 3. ペナルティ直撃
            opponent.hand = [];
            opponent.defenseCard = null;
            applyScoreChange(opponent, -3000);
            opponent.immunityCount = 2;

            const steroidWasteNotice = (autoRes && !autoRes.canBlock) ? `(「ステロイド」自動消費・ペナルティ直撃)` : `(成功)`;
            penalizedNames.push(`${opponent.name}${steroidWasteNotice}`);
        }
    });

    pendingDarkMatterResolvers.forEach(resolver => {
        const res = resolver(gameState, io);
        if (res) {
            if (res.penaltyLogSuffix) penalizedNames.push(res.penaltyLogSuffix);
            if (res.darkMatterCutinData && io) {
                io.emit('playAttackCutin', res.darkMatterCutinData);
            }
        }
    });

    let logMsg = `${player.name} の「${cardName}」が解除され、+1,000点獲得！`;
    if (penalizedNames.length > 0) logMsg += ` ペナルティ結果: ${penalizedNames.join(', ')}`;
    return logMsg;
}

module.exports = {
    executeDiamondSword,
    executeEarthquake,
    executeDisasterAttack,
    executeDarkMatter,
    executeSmokeScreen,
    handleBuffExpire
};