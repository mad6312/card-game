/**
 * 特殊効果・範囲攻撃・バフ解除実行モジュール (battle/specials.js)
 * ダイヤの剣・地震・大災害・ダークマター・煙幕・バフ解除処理
 */

const { applyScoreChange } = require('./common');

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
    executeDiamondSword,
    executeEarthquake,
    executeDisasterAttack,
    executeDarkMatter,
    executeSmokeScreen,
    handleBuffExpire
};