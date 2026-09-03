/**
 * 緊急自動発動（手札カウンター防御）判定モジュール (battle/triggers.js)
 * 「ステロイド」「無敵アーマー」「ダークマター」の手札自動発動ロジック
 */

const { applyScoreChange } = require('./common');

/**
 * ダメージ・ペナルティ確定直前の自動割り込み判定
 * @param {Object} gameState ゲーム状態
 * @param {Object} victim 被害者プレイヤーオブジェクト
 * @param {Object} options オプション { allowSteroid: boolean, isImmuneToRound1CardEffect: Function, broadcastGameState: Function }
 * @returns {Object|null} 発動結果 { triggered: true, cardId: string, cardName: string, stateName: string, canBlock: boolean, hadDefense: boolean, logMsg: string, resolveDarkMatterPenalty: Function|null } または null
 */
function tryAutoTriggerDefense(gameState, victim, options = {}) {
    if (!victim || !victim.hand || victim.hand.length === 0) return null;

    // 既に無敵またはステロイド状態の場合は発動不要
    const isAlreadyInvincible = victim.invincibleTurns && victim.invincibleTurns > 0;
    const isAlreadySteroid = victim.steroidTurns && victim.steroidTurns > 0;
    if (isAlreadyInvincible || isAlreadySteroid) return null;

    const allowSteroid = options.allowSteroid !== false; // ステロイドで防げる攻撃かどうか
    const broadcastGameState = options.broadcastGameState || (() => { });
    const isImmuneToRound1 = options.isImmuneToRound1CardEffect || (() => false);

    const steroidIdx = victim.hand.findIndex(c => c.id === 'steroid');
    const armorIdx = victim.hand.findIndex(c => c.id === 'invincible_armor');
    const darkMatterIdx = victim.hand.findIndex(c => c.id === 'dark_matter');

    let chosenIdx = -1;
    let chosenCardId = '';

    if (allowSteroid) {
        // 【ケースA】ステロイド状態でも防げる通常攻撃・ペナルティ
        // 優先順: 1. ステロイド > 2. 無敵アーマー > 3. ダークマター
        if (steroidIdx !== -1) {
            chosenIdx = steroidIdx;
            chosenCardId = 'steroid';
        } else if (armorIdx !== -1) {
            chosenIdx = armorIdx;
            chosenCardId = 'invincible_armor';
        } else if (darkMatterIdx !== -1) {
            chosenIdx = darkMatterIdx;
            chosenCardId = 'dark_matter';
        }
    } else {
        // 【ケースB】ステロイド状態では防げない攻撃・ペナルティ（無敵アーマー/ダークマターペナルティ等）
        // 優先順: 1. 無敵アーマー > 2. ダークマター > 3. ステロイド (※無駄消費)
        if (armorIdx !== -1) {
            chosenIdx = armorIdx;
            chosenCardId = 'invincible_armor';
        } else if (darkMatterIdx !== -1) {
            chosenIdx = darkMatterIdx;
            chosenCardId = 'dark_matter';
        } else if (steroidIdx !== -1) {
            chosenIdx = steroidIdx;
            chosenCardId = 'steroid';
        }
    }

    if (chosenIdx === -1) return null;

    // ----------------------------------------------------
    // 【割り込み処理の実行】
    // Ⅰ. セット済み防御カードの全破棄
    // ----------------------------------------------------
    let hadDefense = !!victim.defenseCard;
    victim.defenseCard = null;

    // ----------------------------------------------------
    // Ⅱ. カードの自動使用・状態適用
    // ----------------------------------------------------
    const cardObj = victim.hand.splice(chosenIdx, 1)[0];
    let stateName = '';
    let logMsg = '';
    let canBlock = true;
    let resolveDarkMatterPenalty = null;

    if (chosenCardId === 'steroid') {
        victim.steroidTurns = 4;
        victim.steroidRevealed = true; // 公開状態
        if (victim.timeBombTurns > 0) victim.timeBombTurns = 0; // 時限爆弾消滅
        if (victim.darknessTurns > 0) victim.darknessTurns = 0; // 暗闇状態即時解除
        stateName = 'ステロイド！';

        if (allowSteroid) {
            canBlock = true;
            logMsg = `${victim.name} の手札から「ステロイド」が自動発動！ (防御カード全破棄＆ステロイド状態付与)`;
        } else {
            canBlock = false;
            logMsg = `${victim.name} の手札から「ステロイド」が自動使用されましたが、この効果は無効化できません！ (ステロイド状態のみ付与)`;
        }
    } else if (chosenCardId === 'invincible_armor') {
        victim.invincibleTurns = 4;
        victim.invincibleSource = 'ARMOR';
        victim.armorRevealed = true; // 公開状態
        if (victim.timeBombTurns > 0) victim.timeBombTurns = 0; // 時限爆弾消滅
        if (victim.darknessTurns > 0) victim.darknessTurns = 0; // 暗闇状態即時解除
        stateName = '無敵！';
        canBlock = true;
        logMsg = `${victim.name} の手札から「無敵アーマー」が自動発動！ (防御カード全破棄＆無敵状態付与)`;
    } else if (chosenCardId === 'dark_matter') {
        victim.invincibleTurns = 1;
        victim.invincibleSource = 'DARK_MATTER';
        if (victim.timeBombTurns > 0) victim.timeBombTurns = 0; // 時限爆弾消滅
        if (victim.darknessTurns > 0) victim.darknessTurns = 0; // 暗闇状態即時解除

        const prevScore = victim.score;
        applyScoreChange(victim, 5000);
        const newScore = victim.score;

        stateName = '無敵！';
        canBlock = true;
        logMsg = `${victim.name} の手札から「ダークマター」が自動発動！ +5,000点獲得＆無敵状態付与！ (防御カード全破棄)`;

        // 遅延ペナルティ解決関数
        resolveDarkMatterPenalty = (currentGameState, io) => {
            const penalizedNames = [];
            const defendersList = [];
            const victimsData = [];

            Object.values(currentGameState.players).forEach(opponent => {
                if (opponent.id === victim.id || isImmuneToRound1(opponent.id, victim.id)) return;

                const isConditionA = (opponent.score === prevScore);
                const isConditionB = (opponent.score > prevScore && newScore >= opponent.score);

                if (isConditionA || isConditionB) {
                    const isAlreadyOpImmune = opponent.immunityCount && opponent.immunityCount > 0;
                    if (isAlreadyOpImmune) {
                        penalizedNames.push(`${opponent.name}(選択不可ガード)`);
                        return;
                    }

                    defendersList.push({
                        id: opponent.id,
                        name: opponent.name,
                        avatar: opponent.avatar ? `/images/avatars/${opponent.avatar}.png` : '/images/avatars/avatar_default.png'
                    });

                    const isAlreadyOpInvincible = opponent.invincibleTurns && opponent.invincibleTurns > 0;
                    if (isAlreadyOpInvincible) {
                        victimsData.push({
                            id: opponent.id,
                            result: 'PROTECTED',
                            protectText: '無敵！',
                            hasDefenseCard: !!opponent.defenseCard
                        });
                        penalizedNames.push(`${opponent.name}(無敵ガード)`);
                        return;
                    }

                    // 1. 50%不発判定（不発なら相手の手札温存）
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

                    // 2. ペナルティ判定成立時：相手の手札カウンター判定（ステロイドは無効化不可）
                    const autoRes = tryAutoTriggerDefense(currentGameState, opponent, {
                        allowSteroid: false,
                        isImmuneToRound1CardEffect: isImmuneToRound1,
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

                    // 3. ペナルティ効果の実行
                    const hadDefOp = autoRes ? autoRes.hadDefense : !!opponent.defenseCard;
                    opponent.hand = [];
                    opponent.defenseCard = null;
                    applyScoreChange(opponent, -3000);
                    opponent.immunityCount = 2;

                    const steroidNotice = (autoRes && !autoRes.canBlock) ? `(「ステロイド」自動消費・ペナルティ直撃)` : `(成功)`;
                    penalizedNames.push(`${opponent.name}${steroidNotice}`);

                    victimsData.push({
                        id: opponent.id,
                        result: 'HIT',
                        hasDefenseCard: hadDefOp
                    });
                }
            });

            let penaltyLogSuffix = '';
            if (penalizedNames.length > 0) {
                penaltyLogSuffix = ` (ダークマターペナルティ対象: ${penalizedNames.join(', ')})`;
            }

            let darkMatterCutinData = null;
            if (defendersList.length > 0) {
                darkMatterCutinData = {
                    attacker: {
                        id: victim.id,
                        name: victim.name,
                        avatar: victim.avatar ? `/images/avatars/${victim.avatar}.png` : '/images/avatars/avatar_default.png'
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
                };
            }

            return {
                penaltyLogSuffix,
                darkMatterCutinData
            };
        };
    }

    return {
        triggered: true,
        cardId: chosenCardId,
        cardName: cardObj.name,
        stateName: stateName,
        canBlock: canBlock,
        hadDefense: hadDefense,
        logMsg: logMsg,
        resolveDarkMatterPenalty: resolveDarkMatterPenalty
    };
}

module.exports = {
    tryAutoTriggerDefense
};