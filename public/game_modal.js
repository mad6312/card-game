/**
 * ゲームモーダル＆アクション制御モジュール (public/game_modal.js)
 * カード操作モーダル、リアルタイム命中率計算、ボーナス選択、時限爆弾操作
 */

(function (window) {
    'use strict';

    // 命中率計算ユーティリティ：下位全員（基準命中率 baseRate に対応）
    function calculateLowerTargetsHitRates(lowerPlayers, isDarkness = false, baseRate = 0.5) {
        if (!lowerPlayers || lowerPlayers.length === 0) return [];

        const sorted = [...lowerPlayers].sort((a, b) => b.score - a.score);
        const groups = [];
        sorted.forEach(p => {
            let lastGroup = groups[groups.length - 1];
            if (lastGroup && lastGroup.score === p.score) {
                lastGroup.players.push(p);
            } else {
                groups.push({ score: p.score, players: [p] });
            }
        });

        const result = [];
        let pMiss = 1.0;
        const darknessMult = isDarkness ? 0.5 : 1.0;

        groups.forEach(group => {
            const m = group.players.length;
            const effectiveProb = baseRate * darknessMult;
            const groupHitProb = pMiss * (1 - Math.pow(1 - effectiveProb, m));
            const individualHitProb = groupHitProb / m;

            group.players.forEach(p => {
                const ratePercent = Math.round(individualHitProb * 1000) / 10;
                result.push({ player: p, hitRate: ratePercent });
            });

            pMiss = pMiss * Math.pow(1 - effectiveProb, m);
        });

        return result;
    }

    // 命中率計算ユーティリティ：木の盾（グループ）
    function calculateWoodShieldGroupHitRates(candidates, myScore, attackCount = 1, isDarkness = false) {
        if (!candidates || candidates.length === 0) return { groupStr: '', rateDetailStr: '' };

        const hitProbabilities = {};
        candidates.forEach(p => hitProbabilities[p.id] = 0);

        let currentStates = [{ aliveIds: candidates.map(p => p.id), prob: 1.0 }];
        const darknessMult = isDarkness ? 0.5 : 1.0;

        for (let step = 0; step < attackCount; step++) {
            const nextStates = [];
            currentStates.forEach(state => {
                const aliveCandidates = candidates.filter(p => state.aliveIds.includes(p.id));
                if (aliveCandidates.length === 0) {
                    nextStates.push(state);
                    return;
                }

                const groups = [];
                const sorted = [...aliveCandidates].sort((a, b) => Math.abs(myScore - a.score) - Math.abs(myScore - b.score));
                sorted.forEach(p => {
                    const diff = Math.abs(myScore - p.score);
                    let last = groups[groups.length - 1];
                    if (last && last.diff === diff) last.players.push(p);
                    else groups.push({ diff, players: [p] });
                });

                const singleHitProb = {};
                let pMissCumulative = 1.0;

                groups.forEach(g => {
                    const m = g.players.length;
                    let r = Math.max(0, 1 - g.diff / 10000) * darknessMult;
                    if (r <= 0 || m === 0) return;

                    const pGroupAllMiss = Math.pow(1 - r, m);
                    const pGroupHitTotal = pMissCumulative * (1 - pGroupAllMiss);
                    const pIndividual = pGroupHitTotal / m;

                    g.players.forEach(p => singleHitProb[p.id] = pIndividual);
                    pMissCumulative *= pGroupAllMiss;
                });

                const totalHitProbInThisStep = Object.values(singleHitProb).reduce((a, b) => a + b, 0);
                const missProbInThisStep = 1 - totalHitProbInThisStep;

                if (missProbInThisStep > 0) {
                    nextStates.push({ aliveIds: [...state.aliveIds], prob: state.prob * missProbInThisStep });
                }

                Object.keys(singleHitProb).forEach(hitPlayerId => {
                    const pHit = singleHitProb[hitPlayerId];
                    if (pHit <= 0) return;

                    const transitionProb = state.prob * pHit;
                    hitProbabilities[hitPlayerId] += transitionProb;

                    nextStates.push({
                        aliveIds: state.aliveIds.filter(id => id !== hitPlayerId),
                        prob: transitionProb
                    });
                });
            });

            currentStates = nextStates;
        }

        const rateDetails = [];
        const playerNames = [];

        candidates.forEach(p => {
            const finalProb = hitProbabilities[p.id] || 0;
            const ratePercent = Math.round(finalProb * 1000) / 10;
            rateDetails.push(`${p.name}: ${ratePercent}%`);
            playerNames.push(p.name);
        });

        return { groupStr: playerNames.join(','), rateDetailStr: rateDetails.join(', ') };
    }

    // 命中率計算ユーティリティ：青銅の盾（グループ）
    function calculateBronzeShieldGroupHitRates(candidates, myScore, isDarkness = false) {
        if (!candidates || candidates.length === 0) return { groupStr: '', rateDetailStr: '' };

        const sorted = [...candidates].sort((a, b) => (myScore - a.score) - (myScore - b.score));
        const darknessMult = isDarkness ? 0.5 : 1.0;

        const groups = [];
        sorted.forEach(p => {
            const diff = myScore - p.score;
            let last = groups[groups.length - 1];
            if (last && last.diff === diff) last.players.push(p);
            else groups.push({ diff, players: [p] });
        });

        const result = [];
        let pMissCumulative = 1.0;

        groups.forEach(g => {
            const m = g.players.length;
            let r = Math.max(0, 1 - g.diff / 5000) * darknessMult;
            if (r <= 0 || m === 0) return;

            const pGroupAllMiss = Math.pow(1 - r, m);
            const pGroupHitTotal = pMissCumulative * (1 - pGroupAllMiss);
            const pIndividual = pGroupHitTotal / m;

            g.players.forEach(p => {
                const ratePercent = Math.round(pIndividual * 1000) / 10;
                result.push(`${p.name}: ${ratePercent}%`);
            });

            pMissCumulative *= pGroupAllMiss;
        });

        return { groupStr: sorted.map(p => p.name).join(','), rateDetailStr: result.join(', ') };
    }

    // 命中率計算ユーティリティ：青銅の盾セット（グループ連撃）
    function calculateBronzeShieldSetGroupHitRates(candidates, myScore, attackCount = 1, isDarkness = false) {
        if (!candidates || candidates.length === 0) return { groupStr: '', rateDetailStr: '' };

        const hitProbabilities = {};
        candidates.forEach(p => hitProbabilities[p.id] = 0);

        let currentStates = [{ aliveIds: candidates.map(p => p.id), prob: 1.0 }];
        const darknessMult = isDarkness ? 0.5 : 1.0;

        for (let step = 0; step < attackCount; step++) {
            const nextStates = [];
            currentStates.forEach(state => {
                const aliveCandidates = candidates.filter(p => state.aliveIds.includes(p.id));
                if (aliveCandidates.length === 0) {
                    nextStates.push(state);
                    return;
                }

                const groups = [];
                const sorted = [...aliveCandidates].sort((a, b) => (myScore - a.score) - (myScore - b.score));
                sorted.forEach(p => {
                    const diff = myScore - p.score;
                    let last = groups[groups.length - 1];
                    if (last && last.diff === diff) last.players.push(p);
                    else groups.push({ diff, players: [p] });
                });

                const singleHitProb = {};
                let pMissCumulative = 1.0;

                groups.forEach(g => {
                    const m = g.players.length;
                    let r = Math.max(0, 1 - g.diff / 5000) * darknessMult;
                    if (r <= 0 || m === 0) return;

                    const pGroupAllMiss = Math.pow(1 - r, m);
                    const pGroupHitTotal = pMissCumulative * (1 - pGroupAllMiss);
                    const pIndividual = pGroupHitTotal / m;

                    g.players.forEach(p => singleHitProb[p.id] = pIndividual);
                    pMissCumulative *= pGroupAllMiss;
                });

                const totalHitProbInThisStep = Object.values(singleHitProb).reduce((a, b) => a + b, 0);
                const missProbInThisStep = 1 - totalHitProbInThisStep;

                if (missProbInThisStep > 0) {
                    nextStates.push({ aliveIds: [...state.aliveIds], prob: state.prob * missProbInThisStep });
                }

                Object.keys(singleHitProb).forEach(hitPlayerId => {
                    const pHit = singleHitProb[hitPlayerId];
                    if (pHit <= 0) return;

                    const transitionProb = state.prob * pHit;
                    hitProbabilities[hitPlayerId] += transitionProb;

                    nextStates.push({
                        aliveIds: state.aliveIds.filter(id => id !== hitPlayerId),
                        prob: transitionProb
                    });
                });
            });

            currentStates = nextStates;
        }

        const rateDetails = [];
        const playerNames = [];

        candidates.forEach(p => {
            const finalProb = hitProbabilities[p.id] || 0;
            const ratePercent = Math.round(finalProb * 1000) / 10;
            rateDetails.push(`${p.name}: ${ratePercent}%`);
            playerNames.push(p.name);
        });

        return { groupStr: playerNames.join(','), rateDetailStr: rateDetails.join(', ') };
    }

    // 命中率計算ユーティリティ：木の剣セット（グループ連撃）
    function calculateWoodSwordSetGroupHitRates(candidates, myScore, attackCount = 1, isDarkness = false) {
        if (!candidates || candidates.length === 0) return { groupStr: '', rateDetailStr: '' };

        const hitProbabilities = {};
        candidates.forEach(p => hitProbabilities[p.id] = 0);

        let currentStates = [{ aliveIds: candidates.map(p => p.id), prob: 1.0 }];
        const darknessMult = isDarkness ? 0.5 : 1.0;
        const baseProb = 0.5 * darknessMult;

        for (let step = 0; step < attackCount; step++) {
            const nextStates = [];
            currentStates.forEach(state => {
                const aliveCandidates = candidates.filter(p => state.aliveIds.includes(p.id));
                if (aliveCandidates.length === 0) {
                    nextStates.push(state);
                    return;
                }

                const groups = [];
                const sorted = [...aliveCandidates].sort((a, b) => Math.abs(myScore - a.score) - Math.abs(myScore - b.score));
                sorted.forEach(p => {
                    const diff = Math.abs(myScore - p.score);
                    let last = groups[groups.length - 1];
                    if (last && last.diff === diff) last.players.push(p);
                    else groups.push({ diff, players: [p] });
                });

                const singleHitProb = {};
                let pMissCumulative = 1.0;

                groups.forEach(g => {
                    const m = g.players.length;
                    let r = baseProb;
                    if (r <= 0 || m === 0) return;

                    const pGroupAllMiss = Math.pow(1 - r, m);
                    const pGroupHitTotal = pMissCumulative * (1 - pGroupAllMiss);
                    const pIndividual = pGroupHitTotal / m;

                    g.players.forEach(p => singleHitProb[p.id] = pIndividual);
                    pMissCumulative *= pGroupAllMiss;
                });

                const totalHitProbInThisStep = Object.values(singleHitProb).reduce((a, b) => a + b, 0);
                const missProbInThisStep = 1 - totalHitProbInThisStep;

                if (missProbInThisStep > 0) {
                    nextStates.push({ aliveIds: [...state.aliveIds], prob: state.prob * missProbInThisStep });
                }

                Object.keys(singleHitProb).forEach(hitPlayerId => {
                    const pHit = singleHitProb[hitPlayerId];
                    if (pHit <= 0) return;

                    const transitionProb = state.prob * pHit;
                    hitProbabilities[hitPlayerId] += transitionProb;

                    nextStates.push({
                        aliveIds: state.aliveIds.filter(id => id !== hitPlayerId),
                        prob: transitionProb
                    });
                });
            });

            currentStates = nextStates;
        }

        const rateDetails = [];
        const playerNames = [];

        candidates.forEach(p => {
            const finalProb = hitProbabilities[p.id] || 0;
            const ratePercent = Math.round(finalProb * 1000) / 10;
            rateDetails.push(`${p.name}: ${ratePercent}%`);
            playerNames.push(p.name);
        });

        return { groupStr: playerNames.join(','), rateDetailStr: rateDetails.join(', ') };
    }

    // 命中率表示のリアルタイム更新
    function updateHitRateDisplay(selectEl) {
        if (!selectEl) return;
        const displayEl = document.getElementById('hit-rate-info');
        if (!displayEl) return;

        const selectedOption = selectEl.options[selectEl.selectedIndex];
        if (!selectedOption) {
            displayEl.innerText = '';
            return;
        }

        const cardId = selectEl.getAttribute('data-card-id');
        const isDefense = (selectEl.id === 'drop-def-attack-target');

        const myPlayer = (window.latestGameState && window.myId) ? window.latestGameState.players[window.myId] : null;
        const myScore = myPlayer ? myPlayer.score : 0;
        const isDarkness = myPlayer && myPlayer.darknessTurns > 0;
        const allPlayers = (window.latestGameState && window.latestGameState.players) ? Object.values(window.latestGameState.players) : [];

        // 1. 木の盾 / 木の盾セット
        if (cardId === 'wood_shield' || cardId === 'wood_shield_set') {
            let countSelect = isDefense ? document.getElementById('drop-def-attack-count') : document.getElementById(`drop-attack-count-${selectEl.id.replace(/^drop-target-/, '')}`);
            const attackCount = (cardId === 'wood_shield_set' && countSelect) ? (Number(countSelect.value) || 1) : 1;

            if (myPlayer) {
                const validCandidates = allPlayers.filter(p => {
                    if (p.id === window.myId || (p.immunityCount && p.immunityCount > 0) || window.isLaterPlayerInRound1(window.myId, p.id)) return false;
                    return true;
                });

                let targetCandidates = [];
                if (selectEl.value === 'EQUAL_OR_HIGHER') {
                    targetCandidates = validCandidates.filter(p => p.score >= myScore && Math.abs(myScore - p.score) < 10000);
                } else if (selectEl.value === 'LOWER') {
                    targetCandidates = validCandidates.filter(p => p.score < myScore && Math.abs(myScore - p.score) < 10000);
                }

                if (targetCandidates.length > 0) {
                    const { rateDetailStr } = calculateWoodShieldGroupHitRates(targetCandidates, myScore, attackCount, isDarkness);
                    displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${rateDetailStr}${isDarkness ? ' (暗闇半減)' : ''}</span>`;
                } else {
                    displayEl.innerHTML = `🎯 命中率: <span style="color:#94a3b8;">対象なし (0%)</span>`;
                }
                return;
            }
        }

        // 2. 青銅の盾 / 青銅の盾セット
        if (cardId === 'bronze_shield' || cardId === 'bronze_shield_set') {
            let countSelect = isDefense ? document.getElementById('drop-def-attack-count') : document.getElementById(`drop-attack-count-${selectEl.id.replace(/^drop-target-/, '')}`);
            const attackCount = (cardId === 'bronze_shield_set' && countSelect) ? (Number(countSelect.value) || 1) : 1;

            if (myPlayer) {
                const validCandidates = allPlayers.filter(p => {
                    if (p.id === window.myId || (p.immunityCount && p.immunityCount > 0) || window.isLaterPlayerInRound1(window.myId, p.id)) return false;
                    return true;
                });

                if (selectEl.value === 'CLOSEST_HIGHER') {
                    const higherCandidates = validCandidates.filter(p => (p.score - myScore) >= 0 && (p.score - myScore) <= 10000);
                    if (higherCandidates.length > 0) {
                        const minDiff = Math.min(...higherCandidates.map(p => p.score - myScore));
                        const closestGroup = higherCandidates.filter(p => (p.score - myScore) === minDiff);
                        const m = closestGroup.length;

                        if (m === 1) {
                            displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">100% (必中)</span>`;
                        } else {
                            const prob = Math.min(1.0, attackCount / m);
                            const ratePercent = Math.round(prob * 1000) / 10;
                            const rateDetailStr = closestGroup.map(p => `${p.name}: ${ratePercent}%`).join(', ');
                            const countText = (cardId === 'bronze_shield_set' && attackCount > 1) ? ` (${attackCount}回連撃/実質選出率)` : ` (選出確率)`;
                            displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${rateDetailStr}${countText}</span>`;
                        }
                    } else {
                        displayEl.innerHTML = `🎯 命中率: <span style="color:#94a3b8;">対象なし (0%)</span>`;
                    }
                    return;
                } else if (selectEl.value === 'LOWER') {
                    const lowerCandidates = validCandidates.filter(p => p.score < myScore && (myScore - p.score) < 5000);
                    if (lowerCandidates.length > 0) {
                        let res;
                        if (cardId === 'bronze_shield_set') {
                            res = calculateBronzeShieldSetGroupHitRates(lowerCandidates, myScore, attackCount, isDarkness);
                        } else {
                            res = calculateBronzeShieldGroupHitRates(lowerCandidates, myScore, isDarkness);
                        }
                        displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${res.rateDetailStr}${isDarkness ? ' (暗闇半減)' : ''}</span>`;
                    } else {
                        displayEl.innerHTML = `🎯 命中率: <span style="color:#94a3b8;">対象なし (0%)</span>`;
                    }
                    return;
                }
            }
        }

        // 3. グレネード（下位全員: 基準80%, 暗闇40% / 単体: 基準50%, 暗闇25%）
        if (cardId === 'grenade') {
            if (selectEl.value === 'ALL_LOWER' && myPlayer) {
                const candidates = allPlayers.filter(p => {
                    if (p.id === window.myId || (p.immunityCount && p.immunityCount > 0) || window.isLaterPlayerInRound1(window.myId, p.id)) return false;
                    const diff = myScore - p.score;
                    return diff >= 1 && diff <= 5000;
                });
                if (candidates.length > 0) {
                    const hitRates = calculateLowerTargetsHitRates(candidates, isDarkness, 0.8);
                    const rateDetailStr = hitRates.map(item => `${item.player.name}: ${item.hitRate}%`).join(', ');
                    displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${rateDetailStr}${isDarkness ? ' (暗闇半減)' : ''}</span>`;
                } else {
                    displayEl.innerHTML = `🎯 命中率: <span style="color:#94a3b8;">対象なし (0%)</span>`;
                }
                return;
            } else {
                const baseRate = isDarkness ? 0.25 : 0.5;
                displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${baseRate * 100}%${isDarkness ? ' (暗闇半減)' : ''}</span>`;
                return;
            }
        }

        // 4. 木の剣セット
        if (cardId === 'wood_sword_set') {
            let countSelect = isDefense ? document.getElementById('drop-def-attack-count') : document.getElementById(`drop-attack-count-${selectEl.id.replace(/^drop-target-/, '')}`);
            const attackCount = countSelect ? (Number(countSelect.value) || 1) : 1;

            if (selectEl.value === 'ALL_LOWER' && myPlayer) {
                const lowerCandidates = allPlayers.filter(p => p.score < myScore && (!p.immunityCount || p.immunityCount <= 0) && !window.isLaterPlayerInRound1(window.myId, p.id));
                if (lowerCandidates.length > 0) {
                    const { rateDetailStr } = calculateWoodSwordSetGroupHitRates(lowerCandidates, myScore, attackCount, isDarkness);
                    displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${rateDetailStr}${isDarkness ? ' (暗闇半減)' : ''}</span>`;
                } else {
                    displayEl.innerHTML = `🎯 命中率: <span style="color:#94a3b8;">対象なし (0%)</span>`;
                }
                return;
            } else {
                const baseRate = isDarkness ? 0.25 : 0.5;
                const cumulativeHitRate = (1 - Math.pow(1 - baseRate, attackCount));
                const ratePercent = Math.round(cumulativeHitRate * 1000) / 10;
                displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${ratePercent}% (${attackCount}回攻撃)${isDarkness ? ' (暗闇半減)' : ''}</span>`;
                return;
            }
        }

        // 5. 木の剣 / ショットガン
        if (cardId === 'wood_sword' || cardId === 'shotgun') {
            if (selectEl.value === 'ALL_LOWER' && myPlayer) {
                const lowerCandidates = allPlayers.filter(p => p.score < myScore && (!p.immunityCount || p.immunityCount <= 0) && !window.isLaterPlayerInRound1(window.myId, p.id));
                if (lowerCandidates.length > 0) {
                    const hitRates = calculateLowerTargetsHitRates(lowerCandidates, isDarkness, 0.5);
                    const rateDetailStr = hitRates.map(item => `${item.player.name}: ${item.hitRate}%`).join(', ');
                    displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${rateDetailStr}${isDarkness ? ' (暗闇半減)' : ''}</span>`;
                } else {
                    displayEl.innerHTML = `🎯 命中率: <span style="color:#94a3b8;">対象なし (0%)</span>`;
                }
                return;
            } else {
                const baseRate = isDarkness ? 0.25 : 0.5;
                displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${baseRate * 100}%${isDarkness ? ' (暗闇半減)' : ''}</span>`;
                return;
            }
        }

        // 6. 単体指定フォールバック
        const rawRateInfo = selectedOption.getAttribute('data-hitrate');
        if (rawRateInfo) {
            let displayStr = rawRateInfo;
            if (isDarkness) {
                displayStr = rawRateInfo.replace(/(\d+(\.\d+)?)%/g, (match, p1) => {
                    return `${(parseFloat(p1) / 2).toFixed(1).replace(/\.0$/, '')}%`;
                }) + ' (暗闇半減)';
            }
            displayEl.innerHTML = `🎯 命中率: <span style="color:#f1c40f; font-weight:bold;">${displayStr}</span>`;
        } else {
            displayEl.innerHTML = '';
        }
    }

    // カード操作モーダルの展開
    function openDropCardModal(source, instanceId) {
        if (!window.latestGameState) return;

        const currentTurnId = window.latestGameState.currentTurnPlayerId;
        if (window.myId !== currentTurnId || window.latestGameState.turnPhase !== 'MAIN') return;

        const myPlayer = window.latestGameState.players[window.myId];
        if (!myPlayer) return;

        let isBlockedByDefense = false;

        if (source === 'HAND') {
            const targetHandCard = myPlayer.hand.find(c => String(c.instanceId) === String(instanceId));
            if (myPlayer.defenseCard && targetHandCard && !targetHandCard.allowWithDefense) {
                isBlockedByDefense = true;
                source = 'DEFENSE';
            }
        }

        const modal = document.getElementById('drop-action-modal');
        const preview = document.getElementById('drop-modal-card-preview');
        const actions = document.getElementById('drop-modal-actions');
        const title = document.getElementById('drop-modal-title');

        preview.innerHTML = '';
        actions.innerHTML = '';

        let card = null;
        let usesLeft = 1;

        if (source === 'HAND') {
            card = myPlayer.hand.find(c => String(c.instanceId) === String(instanceId));
            usesLeft = card ? ((card.id === 'wood_shield_set' || card.id === 'bronze_shield_set' || card.id === 'wood_sword_set' || card.id === 'omamori_koban_set') ? (card.usesLeft || 3) : 1) : 1;
        } else if (source === 'DEFENSE') {
            if (myPlayer.defenseCard) {
                card = myPlayer.defenseCard.card;
                usesLeft = myPlayer.defenseCard.usesLeft;
            }
        }

        if (!card) return;

        if (isBlockedByDefense) {
            title.innerHTML = `<span style="color:#e74c3c; font-size:0.9em; display:block; margin-bottom:4px;">防御カードがセットされています</span>【防御カード操作】${card.name}`;
        } else {
            title.innerText = source === 'HAND' ? `【手札操作】${card.name}` : `【防御カード操作】${card.name}`;
        }

        const descText = window.getFormattedCardDesc(card, usesLeft);

        preview.innerHTML = `
            ${card.image ? `<img src="${card.image}" style="width:110px; height:160px; object-fit:contain; border-radius:6px; margin:0 auto; display:block;">` : ''}
            <p style="font-size:0.85em; color:#cbd5e1; margin:8px 0 0 0; white-space:pre-line;">${descText}</p>
        `;

        const hasDefense = !!myPlayer.defenseCard;
        let html = '';

        const hasUsedOban = myPlayer.playedObanThisTurn;
        const hasUsedDarkMatter = myPlayer.playedDarkMatterThisTurn;
        const hasUsedOtherCard = myPlayer.playedHandCardThisTurn && !hasUsedOban && !hasUsedDarkMatter;

        if (source === 'HAND') {
            if (hasUsedOban) {
                html += `
                    <div style="background:#1a252f; padding:10px; border-radius:6px; margin-bottom:10px; text-align:center;">
                        <div style="color:#e74c3c; font-weight:bold; font-size:0.9em; margin-bottom:6px;">※「お守り大判」を使用したため発動できません</div>
                        <button class="btn" disabled style="background:#7f8c8d; width:100%; cursor:not-allowed;">使用不可</button>
                    </div>
                `;
            } else if (hasUsedDarkMatter) {
                html += `
                    <div style="background:#1a252f; padding:10px; border-radius:6px; margin-bottom:10px; text-align:center;">
                        <div style="color:#e74c3c; font-weight:bold; font-size:0.9em; margin-bottom:6px;">※「ダークマター」を使用したため発動できません</div>
                        <button class="btn" disabled style="background:#7f8c8d; width:100%; cursor:not-allowed;">使用不可</button>
                    </div>
                `;
            } else if (card.id === 'omamori_oban') {
                if (hasUsedOtherCard) {
                    html += `
                        <div style="background:#1a252f; padding:10px; border-radius:6px; margin-bottom:10px; text-align:center;">
                            <div style="color:#e74c3c; font-weight:bold; font-size:0.9em; margin-bottom:6px;">※他のカードを使用したため発動できません</div>
                            <button class="btn" disabled style="background:#7f8c8d; width:100%; cursor:not-allowed;">お守り大判を使用する</button>
                        </div>
                    `;
                } else {
                    let scoreOptions = '';
                    for (let s = 8000; s >= 3000; s -= 1000) {
                        scoreOptions += `<option value="${s}" ${s === 8000 ? 'selected' : ''}>+${s.toLocaleString()}点</option>`;
                    }
                    html += `
                        <div style="background:#1a252f; padding:10px; border-radius:6px; margin-bottom:10px; text-align:left;">
                            <b style="color:#f39c12;">💰 獲得得点を選択:</b><br>
                            得点: <select id="drop-oban-score-${card.instanceId}" style="padding:4px; background:#334155; color:#fff; border:1px solid #475569; border-radius:4px; margin:6px 0;">${scoreOptions}</select><br>
                            <button class="btn" style="background:#f39c12; color:#fff; font-size:1.05em; width:100%; font-weight:bold; margin-top:5px;" onclick="executeUseOban('${card.instanceId}')">お守り大判を使用する</button>
                        </div>
                    `;
                }
            } else if (card.id === 'dark_matter') {
                if (hasUsedOtherCard) {
                    html += `
                        <div style="background:#1a252f; padding:10px; border-radius:6px; margin-bottom:10px; text-align:center;">
                            <div style="color:#e74c3c; font-weight:bold; font-size:0.9em; margin-bottom:6px;">※他のカードを使用したため発動できません</div>
                            <button class="btn" disabled style="background:#7f8c8d; width:100%; cursor:not-allowed;">ダークマターを使用する</button>
                        </div>
                    `;
                } else {
                    const allPlayers = Object.values(window.latestGameState.players);
                    const prevMyScore = myPlayer.score;
                    const newMyScore = prevMyScore + 5000;

                    const penaltyTargets = allPlayers.filter(p => {
                        if (p.id === window.myId || window.isLaterPlayerInRound1(window.myId, p.id) || p.invincibleTurns > 0 || (p.immunityCount && p.immunityCount > 0)) return false;
                        return (p.score === prevMyScore) || (p.score > prevMyScore && newMyScore >= p.score);
                    });

                    if (penaltyTargets.length === 0) {
                        html += `<div style="color:#94a3b8; font-size:0.85em; margin-bottom:8px;">※使用時に条件を満たす相手はいません（ペナルティなし）</div>`;
                    } else {
                        const targetNames = penaltyTargets.map(p => p.name).join(', ');
                        html += `<div style="color:#38bdf8; font-size:0.85em; margin-bottom:8px;">ペナルティ対象(50%): <b>${targetNames}</b></div>`;
                    }
                    html += `<button class="btn" style="background:#8e44ad; color:#fff; font-size:1.05em; width:100%; font-weight:bold;" onclick="window.socket.emit('playCard', { instanceId: '${card.instanceId}' }); closeDropActionModal();">ダークマターを使用する</button>`;
                }
            } else if (card.id === 'omamori_koban') {
                html += `<button class="btn" style="background:#f39c12; color:#fff; font-size:1.05em; width:100%; font-weight:bold;" onclick="window.socket.emit('playCard', { instanceId: '${card.instanceId}' }); closeDropActionModal();">お守り小判を使用する (+3,000点)</button>`;
            } else if (card.id === 'omamori_koban_set') {
                const maxUses = card.usesLeft || 3;
                let countOptions = '';
                for (let i = maxUses; i >= 1; i--) {
                    countOptions += `<option value="${i}">${i}回分消費 (+${(i * 2000).toLocaleString()}点)</option>`;
                }
                html += `
                    <div style="background:#1a252f; padding:10px; border-radius:6px; margin-bottom:10px; text-align:left;">
                        <b style="color:#f39c12;">💰 使用回数を指定して発動:</b><br>
                        消費回数: <select id="drop-koban-count-${card.instanceId}" style="padding:4px; background:#334155; color:#fff; border:1px solid #475569; border-radius:4px; margin:6px 0;">${countOptions}</select><br>
                        <button class="btn" style="background:#f39c12; color:#fff; font-size:1.05em; width:100%; font-weight:bold; margin-top:5px;" onclick="executeUseKobanSet('${card.instanceId}')">お守り小判セットを使用する</button>
                    </div>
                `;
            } else if (card.id === 'disaster') {
                html += `<button class="btn" style="background:#c0392b; font-size:1.05em; width:100%; font-weight:bold;" onclick="window.socket.emit('playCard', { instanceId: '${card.instanceId}' }); closeDropActionModal();">大災害を発動する</button>`;
            } else if (card.id === 'diamond_sword') {
                const allPlayers = Object.values(window.latestGameState.players);
                const maxScore = Math.max(...allPlayers.map(p => p.score));
                const targetPlayers = allPlayers.filter(p => {
                    if (p.id !== window.myId && window.isLaterPlayerInRound1(window.myId, p.id)) return false;
                    return Math.abs(maxScore - p.score) <= 1000;
                });

                if (targetPlayers.length === 0) {
                    html += `<div style="color:#e74c3c; font-size:0.85em; font-weight:bold; margin-bottom:8px;">※現在、対象となるプレイヤーが存在しません</div>`;
                } else {
                    const targetNames = targetPlayers.map(p => {
                        const isMe = (p.id === window.myId);
                        const isImmune = (p.immunityCount && p.immunityCount > 0);
                        if (isMe && isImmune) return `${p.name}(あなた・選択不可)`;
                        if (isMe) return `${p.name}(あなた)`;
                        if (isImmune) return `${p.name}(選択不可)`;
                        return p.name;
                    }).join(', ');

                    html += `<div style="color:#38bdf8; font-size:0.85em; margin-bottom:8px;">攻撃対象 (1位±1,000点): <b>${targetNames}</b></div>`;
                }
                html += `<button class="btn" style="background:#0ea5e9; color:#fff; font-size:1.05em; width:100%; font-weight:bold;" onclick="window.socket.emit('playCard', { instanceId: '${card.instanceId}' }); closeDropActionModal();">ダイヤの剣を発動する</button>`;
            } else if (card.id === 'earthquake') {
                const allPlayers = Object.values(window.latestGameState.players);
                const higherTargets = allPlayers.filter(p => p.id !== window.myId && p.score >= myPlayer.score && !window.isLaterPlayerInRound1(window.myId, p.id));

                if (higherTargets.length === 0) {
                    html += `<div style="color:#e74c3c; font-size:0.85em; font-weight:bold; margin-bottom:8px;">※現在、同点以上の相手が存在しません（使用しても不発になります）</div>`;
                } else {
                    const targetNames = higherTargets.map(p => p.name).join(', ');
                    html += `<div style="color:#38bdf8; font-size:0.85em; margin-bottom:8px;">同点以上の対象: <b>${targetNames}</b></div>`;
                }
                html += `<button class="btn" style="background:#d35400; color:#fff; font-size:1.05em; width:100%; font-weight:bold;" onclick="window.socket.emit('playCard', { instanceId: '${card.instanceId}' }); closeDropActionModal();">地震を発動する</button>`;
            } else if (card.id === 'invincible_armor') {
                html += `<button class="btn" style="background:#f1c40f; color:#000; font-size:1.05em; width:100%; font-weight:bold;" onclick="window.socket.emit('playCard', { instanceId: '${card.instanceId}' }); closeDropActionModal();">無敵アーマーを使用する</button>`;
            } else if (card.id === 'steroid') {
                html += `<button class="btn" style="background:#e67e22; color:#fff; font-size:1.05em; width:100%; font-weight:bold;" onclick="window.socket.emit('playCard', { instanceId: '${card.instanceId}' }); closeDropActionModal();">ステロイドを使用する</button>`;
            } else if (card.id === 'smoke_screen') {
                const allPlayers = Object.values(window.latestGameState.players);
                const myScore = myPlayer.score;
                const higherTargets = allPlayers.filter(p => p.id !== window.myId && p.score >= myScore && !window.isLaterPlayerInRound1(window.myId, p.id));

                if (higherTargets.length === 0) {
                    html += `<div style="color:#e74c3c; font-size:0.85em; font-weight:bold; margin-bottom:8px;">※同点以上の相手がいないため、自身に効果が発動します (-1,000点＆暗闇)</div>`;
                } else {
                    const targetNames = higherTargets.map(p => p.name).join(', ');
                    html += `<div style="color:#38bdf8; font-size:0.85em; margin-bottom:8px;">効果対象 (同点以上): <b>${targetNames}</b></div>`;
                }
                html += `<button class="btn" style="background:#7f8c8d; color:#fff; font-size:1.05em; width:100%; font-weight:bold;" onclick="window.socket.emit('playCard', { instanceId: '${card.instanceId}' }); closeDropActionModal();">煙幕を使用する</button>`;
            } else {
                let targetOptionsHtml = '';
                let hasValidTarget = false;

                if (card.id === 'wood_shield' || card.id === 'wood_shield_set') {
                    const allPlayers = Object.values(window.latestGameState.players);
                    const myScore = myPlayer.score;
                    const validCandidates = allPlayers.filter(p => p.id !== window.myId && (!p.immunityCount || p.immunityCount <= 0) && !window.isLaterPlayerInRound1(window.myId, p.id));
                    const hitCandidates = validCandidates.filter(p => Math.abs(myScore - p.score) < 10000);
                    const equalOrHigher = hitCandidates.filter(p => p.score >= myScore);
                    const lower = hitCandidates.filter(p => p.score < myScore);

                    if (equalOrHigher.length > 0) {
                        hasValidTarget = true;
                        const { groupStr, rateDetailStr } = calculateWoodShieldGroupHitRates(equalOrHigher, myScore, 1, myPlayer.darknessTurns > 0);
                        targetOptionsHtml += `<option value="EQUAL_OR_HIGHER" data-hitrate="${rateDetailStr}">同点以上 (${groupStr})</option>`;
                    }
                    if (lower.length > 0) {
                        hasValidTarget = true;
                        const { groupStr, rateDetailStr } = calculateWoodShieldGroupHitRates(lower, myScore, 1, myPlayer.darknessTurns > 0);
                        targetOptionsHtml += `<option value="LOWER" data-hitrate="${rateDetailStr}">下位全員 (${groupStr})</option>`;
                    }
                } else if (card.id === 'bronze_shield' || card.id === 'bronze_shield_set') {
                    const allPlayers = Object.values(window.latestGameState.players);
                    const myScore = myPlayer.score;
                    const validCandidates = allPlayers.filter(p => p.id !== window.myId && (!p.immunityCount || p.immunityCount <= 0) && !window.isLaterPlayerInRound1(window.myId, p.id));
                    const higherCandidates = validCandidates.filter(p => (p.score - myScore) >= 0 && (p.score - myScore) <= 10000);

                    if (higherCandidates.length > 0) {
                        hasValidTarget = true;
                        const minDiff = Math.min(...higherCandidates.map(p => p.score - myScore));
                        const closestGroup = higherCandidates.filter(p => (p.score - myScore) === minDiff);
                        const indivRate = Math.round((100 / closestGroup.length) * 10) / 10;
                        const rateDetailStr = closestGroup.map(p => `${p.name}: ${indivRate}%`).join(', ');
                        targetOptionsHtml += `<option value="CLOSEST_HIGHER" data-hitrate="${rateDetailStr}">同点以上最寄 (${closestGroup.map(p => p.name).join('/')})</option>`;
                    }

                    const lowerCandidates = validCandidates.filter(p => p.score < myScore && (myScore - p.score) < 5000);
                    if (lowerCandidates.length > 0) {
                        hasValidTarget = true;
                        const isDarkness = myPlayer.darknessTurns > 0;
                        let res;
                        if (card.id === 'bronze_shield_set') {
                            res = calculateBronzeShieldSetGroupHitRates(lowerCandidates, myScore, 1, isDarkness);
                        } else {
                            res = calculateBronzeShieldGroupHitRates(lowerCandidates, myScore, isDarkness);
                        }
                        targetOptionsHtml += `<option value="LOWER" data-hitrate="${res.rateDetailStr}">下位全員 (${res.groupStr})</option>`;
                    }
                } else if (card.id === 'grenade') {
                    const allPlayers = Object.values(window.latestGameState.players);
                    const myScore = myPlayer.score;

                    allPlayers.forEach((p) => {
                        if (p.id !== window.myId) {
                            const scoreDiff = p.score - myScore;
                            const isImmune = p.immunityCount && p.immunityCount > 0;
                            if (!window.isLaterPlayerInRound1(window.myId, p.id) && scoreDiff >= 0 && scoreDiff <= 5000 && !isImmune) {
                                hasValidTarget = true;
                                targetOptionsHtml += `<option value="${p.id}" data-hitrate="50%">${p.name}</option>`;
                            }
                        }
                    });

                    const lowerCandidates = allPlayers.filter(p => p.id !== window.myId && (!p.immunityCount || p.immunityCount <= 0) && !window.isLaterPlayerInRound1(window.myId, p.id) && (myScore - p.score) >= 1 && (myScore - p.score) <= 5000);
                    if (lowerCandidates.length > 0) {
                        hasValidTarget = true;
                        const hitRates = calculateLowerTargetsHitRates(lowerCandidates, myPlayer.darknessTurns > 0, 0.8);
                        targetOptionsHtml += `<option value="ALL_LOWER" data-hitrate="${hitRates.map(item => `${item.player.name}: ${item.hitRate}%`).join(', ')}">下位全員 (${lowerCandidates.map(p => p.name).join(',')})</option>`;
                    }
                } else if (card.id === 'wood_sword' || card.id === 'wood_sword_set' || card.id === 'shotgun') {
                    const allPlayers = Object.values(window.latestGameState.players);
                    const myScore = myPlayer.score;

                    allPlayers.forEach((p) => {
                        if (p.id !== window.myId) {
                            const scoreDiff = p.score - myScore;
                            const isImmune = p.immunityCount && p.immunityCount > 0;
                            if (!window.isLaterPlayerInRound1(window.myId, p.id) && scoreDiff >= 0 && scoreDiff <= 5000 && !isImmune) {
                                hasValidTarget = true;
                                targetOptionsHtml += `<option value="${p.id}" data-hitrate="50%">${p.name}</option>`;
                            }
                        }
                    });

                    let lowerPlayers = allPlayers.filter(p => p.score < myScore && (!p.immunityCount || p.immunityCount <= 0) && !window.isLaterPlayerInRound1(window.myId, p.id));
                    if (lowerPlayers.length > 0) {
                        hasValidTarget = true;
                        const isDarkness = myPlayer.darknessTurns > 0;
                        if (card.id === 'wood_sword_set') {
                            const { rateDetailStr, groupStr } = calculateWoodSwordSetGroupHitRates(lowerPlayers, myScore, 1, isDarkness);
                            targetOptionsHtml += `<option value="ALL_LOWER" data-hitrate="${rateDetailStr}">下位全員 (${groupStr})</option>`;
                        } else {
                            const hitRates = calculateLowerTargetsHitRates(lowerPlayers, isDarkness, 0.5);
                            targetOptionsHtml += `<option value="ALL_LOWER" data-hitrate="${hitRates.map(item => `${item.player.name}: ${item.hitRate}%`).join(', ')}">下位全員 (${lowerPlayers.map(p => p.name).join(',')})</option>`;
                        }
                    }
                }

                html += `<div style="background:#1a252f; padding:10px; border-radius:6px; margin-bottom:10px; text-align:left;">`;
                html += `<b style="color:#e74c3c;">⚔ 攻撃する:</b><br>`;
                const isSetCard = (card.id === 'wood_shield_set' || card.id === 'bronze_shield_set' || card.id === 'wood_sword_set');

                if (!hasValidTarget) {
                    html += `<div style="color:#e74c3c; font-size:0.85em; font-weight:bold; margin:4px 0;">対象が存在しません</div>`;
                    html += `対象: <select id="drop-target-${card.instanceId}" disabled style="background:#334155; color:#94a3b8; cursor:not-allowed;"></select><br>`;
                    html += `<div id="hit-rate-info" style="font-size:0.85em; margin-top:4px; min-height:1.2em;"></div>`;
                    if (isSetCard) {
                        html += `回数: <select id="drop-attack-count-${card.instanceId}" disabled style="background:#334155; color:#94a3b8; cursor:not-allowed;">`;
                        for (let i = 1; i <= usesLeft; i++) html += `<option value="${i}">${i}回</option>`;
                        html += `</select><br>`;
                    }
                    html += `<button class="btn" disabled style="background:#7f8c8d; margin-top:5px; width:100%; cursor:not-allowed;">攻撃実行</button>`;
                } else {
                    html += `対象: <select id="drop-target-${card.instanceId}" data-card-id="${card.id}" onchange="window.updateHitRateDisplay(this)">${targetOptionsHtml}</select><br>`;
                    html += `<div id="hit-rate-info" style="font-size:0.85em; margin-top:4px; min-height:1.2em;"></div>`;
                    if (isSetCard) {
                        html += `回数: <select id="drop-attack-count-${card.instanceId}" onchange="window.updateHitRateDisplay(document.getElementById('drop-target-${card.instanceId}'))">`;
                        for (let i = 1; i <= usesLeft; i++) html += `<option value="${i}">${i}回</option>`;
                        html += `</select><br>`;
                    }
                    html += `<button class="btn" style="background:#e74c3c; margin-top:5px; width:100%;" onclick="executeDropPlayCard('${card.instanceId}', 'ATTACK')">攻撃実行</button>`;
                }
                html += `</div>`;

                if (card.id !== 'shotgun') {
                    html += `<div style="margin-bottom:8px;">`;
                    if (hasDefense) {
                        html += `<button class="btn" disabled style="background:#7f8c8d; width:100%;">防御にセット不可 (すでにセット中)</button>`;
                    } else {
                        html += `<button class="btn" style="background:#2980b9; width:100%;" onclick="window.socket.emit('playCard', { instanceId: '${card.instanceId}', actionTarget: 'DEFENSE' }); closeDropActionModal();">防御にセット</button>`;
                    }
                    html += `</div>`;
                }
            }
        } else if (source === 'DEFENSE') {
            let targetOptionsHtml = '';
            let hasValidTarget = false;

            if (card.id === 'wood_shield' || card.id === 'wood_shield_set') {
                const allPlayers = Object.values(window.latestGameState.players);
                const myScore = myPlayer.score;
                const validCandidates = allPlayers.filter(p => p.id !== window.myId && (!p.immunityCount || p.immunityCount <= 0) && !window.isLaterPlayerInRound1(window.myId, p.id));
                const hitCandidates = validCandidates.filter(p => Math.abs(myScore - p.score) < 10000);
                const equalOrHigher = hitCandidates.filter(p => p.score >= myScore);
                const lower = hitCandidates.filter(p => p.score < myScore);

                if (equalOrHigher.length > 0) {
                    hasValidTarget = true;
                    const { groupStr, rateDetailStr } = calculateWoodShieldGroupHitRates(equalOrHigher, myScore, 1, myPlayer.darknessTurns > 0);
                    targetOptionsHtml += `<option value="EQUAL_OR_HIGHER" data-hitrate="${rateDetailStr}">同点以上 (${groupStr})</option>`;
                }
                if (lower.length > 0) {
                    hasValidTarget = true;
                    const { groupStr, rateDetailStr } = calculateWoodShieldGroupHitRates(lower, myScore, 1, myPlayer.darknessTurns > 0);
                    targetOptionsHtml += `<option value="LOWER" data-hitrate="${rateDetailStr}">下位全員 (${groupStr})</option>`;
                }
            } else if (card.id === 'bronze_shield' || card.id === 'bronze_shield_set') {
                const allPlayers = Object.values(window.latestGameState.players);
                const myScore = myPlayer.score;
                const validCandidates = allPlayers.filter(p => p.id !== window.myId && (!p.immunityCount || p.immunityCount <= 0) && !window.isLaterPlayerInRound1(window.myId, p.id));
                const higherCandidates = validCandidates.filter(p => (p.score - myScore) >= 0 && (p.score - myScore) <= 10000);

                if (higherCandidates.length > 0) {
                    hasValidTarget = true;
                    const minDiff = Math.min(...higherCandidates.map(p => p.score - myScore));
                    const closestGroup = higherCandidates.filter(p => (p.score - myScore) === minDiff);
                    const indivRate = Math.round((100 / closestGroup.length) * 10) / 10;
                    const rateDetailStr = closestGroup.map(p => `${p.name}: ${indivRate}%`).join(', ');
                    targetOptionsHtml += `<option value="CLOSEST_HIGHER" data-hitrate="${rateDetailStr}">同点以上最寄 (${closestGroup.map(p => p.name).join('/')})</option>`;
                }

                const lowerCandidates = validCandidates.filter(p => p.score < myScore && (myScore - p.score) < 5000);
                if (lowerCandidates.length > 0) {
                    hasValidTarget = true;
                    const isDarkness = myPlayer.darknessTurns > 0;
                    let res;
                    if (card.id === 'bronze_shield_set') {
                        res = calculateBronzeShieldSetGroupHitRates(lowerCandidates, myScore, 1, isDarkness);
                    } else {
                        res = calculateBronzeShieldGroupHitRates(lowerCandidates, myScore, isDarkness);
                    }
                    targetOptionsHtml += `<option value="LOWER" data-hitrate="${res.rateDetailStr}">下位全員 (${res.groupStr})</option>`;
                }
            } else if (card.id === 'grenade') {
                const allPlayers = Object.values(window.latestGameState.players);
                const myScore = myPlayer.score;

                allPlayers.forEach((p) => {
                    if (p.id !== window.myId) {
                        const scoreDiff = p.score - myScore;
                        const isImmune = p.immunityCount && p.immunityCount > 0;
                        if (!window.isLaterPlayerInRound1(window.myId, p.id) && scoreDiff >= 0 && scoreDiff <= 5000 && !isImmune) {
                            hasValidTarget = true;
                            targetOptionsHtml += `<option value="${p.id}" data-hitrate="50%">${p.name}</option>`;
                        }
                    }
                });

                const lowerCandidates = allPlayers.filter(p => p.id !== window.myId && (!p.immunityCount || p.immunityCount <= 0) && !window.isLaterPlayerInRound1(window.myId, p.id) && (myScore - p.score) >= 1 && (myScore - p.score) <= 5000);
                if (lowerCandidates.length > 0) {
                    hasValidTarget = true;
                    const hitRates = calculateLowerTargetsHitRates(lowerCandidates, myPlayer.darknessTurns > 0, 0.8);
                    targetOptionsHtml += `<option value="ALL_LOWER" data-hitrate="${hitRates.map(item => `${item.player.name}: ${item.hitRate}%`).join(', ')}">下位全員 (${lowerCandidates.map(p => p.name).join(',')})</option>`;
                }
            } else if (card.id === 'wood_sword' || card.id === 'wood_sword_set') {
                const allPlayers = Object.values(window.latestGameState.players);
                const myScore = myPlayer.score;

                allPlayers.forEach((p) => {
                    if (p.id !== window.myId) {
                        const scoreDiff = p.score - myScore;
                        const isImmune = p.immunityCount && p.immunityCount > 0;
                        if (!window.isLaterPlayerInRound1(window.myId, p.id) && scoreDiff >= 0 && scoreDiff <= 5000 && !isImmune) {
                            hasValidTarget = true;
                            targetOptionsHtml += `<option value="${p.id}" data-hitrate="50%">${p.name}</option>`;
                        }
                    }
                });

                let lowerPlayers = allPlayers.filter(p => p.score < myScore && (!p.immunityCount || p.immunityCount <= 0) && !window.isLaterPlayerInRound1(window.myId, p.id));
                if (lowerPlayers.length > 0) {
                    hasValidTarget = true;
                    const isDarkness = myPlayer.darknessTurns > 0;
                    if (card.id === 'wood_sword_set') {
                        const { rateDetailStr, groupStr } = calculateWoodSwordSetGroupHitRates(lowerPlayers, myScore, 1, isDarkness);
                        targetOptionsHtml += `<option value="ALL_LOWER" data-hitrate="${rateDetailStr}">下位全員 (${groupStr})</option>`;
                    } else {
                        const hitRates = calculateLowerTargetsHitRates(lowerPlayers, isDarkness, 0.5);
                        targetOptionsHtml += `<option value="ALL_LOWER" data-hitrate="${hitRates.map(item => `${item.player.name}: ${item.hitRate}%`).join(', ')}">下位全員 (${lowerPlayers.map(p => p.name).join(',')})</option>`;
                    }
                }
            }

            html += `<div style="background:#1a252f; padding:10px; border-radius:6px; margin-bottom:10px; text-align:left;">`;
            html += `<b style="color:#e74c3c;">⚔ 防御を外して攻撃:</b><br>`;
            const isSetCard = (card.id === 'wood_shield_set' || card.id === 'bronze_shield_set' || card.id === 'wood_sword_set');

            if (!hasValidTarget) {
                html += `<div style="color:#e74c3c; font-size:0.85em; font-weight:bold; margin:4px 0;">対象が存在しません</div>`;
                html += `対象: <select id="drop-def-attack-target" disabled style="background:#334155; color:#94a3b8; cursor:not-allowed;"></select><br>`;
                html += `<div id="hit-rate-info" style="font-size:0.85em; margin-top:4px; min-height:1.2em;"></div>`;
                if (isSetCard) {
                    html += `回数: <select id="drop-def-attack-count" disabled style="background:#334155; color:#94a3b8; cursor:not-allowed;">`;
                    for (let i = 1; i <= usesLeft; i++) html += `<option value="${i}">${i}回</option>`;
                    html += `</select><br>`;
                }
                html += `<button class="btn" disabled style="background:#7f8c8d; margin-top:5px; width:100%; cursor:not-allowed;">攻撃実行</button>`;
            } else {
                html += `対象: <select id="drop-def-attack-target" data-card-id="${card.id}" onchange="window.updateHitRateDisplay(this)">${targetOptionsHtml}</select><br>`;
                html += `<div id="hit-rate-info" style="font-size:0.85em; margin-top:4px; min-height:1.2em;"></div>`;
                if (isSetCard) {
                    html += `回数: <select id="drop-def-attack-count" onchange="window.updateHitRateDisplay(document.getElementById('drop-def-attack-target'))">`;
                    for (let i = 1; i <= usesLeft; i++) html += `<option value="${i}">${i}回</option>`;
                    html += `</select><br>`;
                }
                html += `<button class="btn" style="background:#e74c3c; margin-top:5px; width:100%;" onclick="executeDropDefenseAttack()">攻撃実行</button>`;
            }
            html += `</div>`;
            html += `<button class="btn" style="background:#c0392b; width:100%;" onclick="window.socket.emit('discardDefense'); closeDropActionModal();">セット解除（破棄）</button>`;
        }

        actions.innerHTML = html;
        modal.style.display = 'flex';

        const firstTargetSelect = actions.querySelector('select[data-card-id]');
        if (firstTargetSelect) {
            updateHitRateDisplay(firstTargetSelect);
        }
    }

    function closeDropActionModal() {
        document.getElementById('drop-action-modal').style.display = 'none';
    }

    function executeDropPlayCard(instanceId, actionTarget) {
        const targetSelect = document.getElementById(`drop-target-${instanceId}`);
        const countSelect = document.getElementById(`drop-attack-count-${instanceId}`);

        const targetPlayerId = targetSelect ? targetSelect.value : null;
        const attackCount = countSelect ? Number(countSelect.value) : 1;

        window.socket.emit('playCard', {
            instanceId: instanceId,
            actionTarget: actionTarget,
            targetPlayerId: targetPlayerId,
            attackCount: attackCount
        });

        closeDropActionModal();
    }

    function executeDropDefenseAttack() {
        const targetSelect = document.getElementById('drop-def-attack-target');
        const countSelect = document.getElementById('drop-def-attack-count');

        const targetPlayerId = targetSelect ? targetSelect.value : null;
        const attackCount = countSelect ? Number(countSelect.value) : 1;

        window.socket.emit('playDefenseAsAttack', {
            targetPlayerId: targetPlayerId,
            attackCount: attackCount
        });

        closeDropActionModal();
    }

    function executeUseKobanSet(instanceId) {
        const selectEl = document.getElementById(`drop-koban-count-${instanceId}`);
        const attackCount = selectEl ? Number(selectEl.value) : 1;
        window.socket.emit('playCard', { instanceId: instanceId, attackCount: attackCount });
        closeDropActionModal();
    }

    function executeUseOban(instanceId) {
        const selectEl = document.getElementById(`drop-oban-score-${instanceId}`);
        const chosenScore = selectEl ? Number(selectEl.value) : 8000;
        window.socket.emit('playCard', { instanceId: instanceId, chosenScore: chosenScore });
        closeDropActionModal();
    }

    function chooseBonusChoice(directAmount) {
        let scoreAmount = 3000;
        if (typeof directAmount === 'number') {
            scoreAmount = directAmount;
        } else {
            const selectEl = document.getElementById('turn-bonus-score-select');
            if (selectEl) {
                scoreAmount = Number(selectEl.value) || 0;
            }
        }

        window.socket.emit('chooseBonus', { scoreAmount });
        const modal = document.getElementById('bonus-choice-modal');
        if (modal) modal.style.display = 'none';
    }

    function toggleBonusSkip(enabled) {
        window.socket.emit('toggleBonusSkipSetting', enabled);
    }

    function openTimeBombModal(isWarningFromEndTurn = false) {
        if (!window.latestGameState || !window.myId) return;
        const myPlayer = window.latestGameState.players[window.myId];
        if (!myPlayer || myPlayer.timeBombTurns <= 0) return;

        window.isTimeBombModalTriggeredByEndTurn = isWarningFromEndTurn;

        const modal = document.getElementById('time-bomb-modal');
        const controls = document.getElementById('time-bomb-modal-controls');
        controls.innerHTML = '';

        const validTargets = Object.values(window.latestGameState.players).filter(p => {
            if (p.id === window.myId) return false;
            const diff = Math.abs(myPlayer.score - p.score);
            const isProtected = (p.invincibleTurns > 0) || (p.steroidTurns > 0);
            return diff <= 3000 && !isProtected;
        });

        if (myPlayer.bombTransferAttempted) {
            controls.innerHTML = `
                <div style="color:#e74c3c; font-weight:bold; margin-bottom:12px;">受け渡しに失敗しました（このターンは再試行できません）</div>
                <button class="btn" style="background:#7f8c8d; width:100%;" onclick="closeTimeBombModal()">閉じる</button>
            `;
        } else if (validTargets.length === 0) {
            controls.innerHTML = `
                <div style="color:#e74c3c; font-weight:bold; margin-bottom:12px;">受け渡し可能な相手が存在しません（±3,000点以内・無敵除く）</div>
                ${isWarningFromEndTurn ? `<button class="btn" style="background:#2980b9; width:100%; margin-bottom:6px;" onclick="closeTimeBombModal(); window.socket.emit('endTurn');">無視してターン終了</button>` : ''}
                <button class="btn" style="background:#7f8c8d; width:100%;" onclick="closeTimeBombModal()">閉じる</button>
            `;
        } else {
            let optionsHtml = '';
            validTargets.forEach(t => {
                const diff = t.score - myPlayer.score;
                const signStr = diff > 0 ? `+${diff.toLocaleString()}` : (diff < 0 ? `${diff.toLocaleString()}` : '±0');
                optionsHtml += `<option value="${t.id}">${t.name} (点差: ${signStr}点)</option>`;
            });

            const submitBtnText = isWarningFromEndTurn ? '50%の確率で受け渡してターン終了' : '50%の確率で受け渡す';

            controls.innerHTML = `
                <div style="margin-bottom:12px; text-align:left; background:#1a252f; padding:10px; border-radius:6px;">
                    <label style="display:block; margin-bottom:4px; font-weight:bold;">受け渡し先プレイヤー:</label>
                    <select id="time-bomb-target-select" style="width:100%; padding:6px; background:#334155; color:#fff; border:1px solid #475569; border-radius:4px;">
                        ${optionsHtml}
                    </select>
                </div>
                <button class="btn" style="background:#e74c3c; width:100%; font-weight:bold; margin-bottom:6px;" onclick="executeTransferTimeBomb()">${submitBtnText}</button>
                ${isWarningFromEndTurn ? `<button class="btn" style="background:#2980b9; width:100%; margin-bottom:6px;" onclick="closeTimeBombModal(); window.socket.emit('endTurn');">無視してターン終了</button>` : ''}
                <button class="btn" style="background:#7f8c8d; width:100%;" onclick="closeTimeBombModal()">閉じる</button>
            `;
        }

        modal.style.display = 'flex';
    }

    function closeTimeBombModal() {
        document.getElementById('time-bomb-modal').style.display = 'none';
    }

    function executeTransferTimeBomb() {
        const selectEl = document.getElementById('time-bomb-target-select');
        if (!selectEl) return;
        const targetPlayerId = selectEl.value;
        window.socket.emit('transferTimeBomb', { targetPlayerId });
    }

    // グローバル公開
    window.updateHitRateDisplay = updateHitRateDisplay;
    window.openDropCardModal = openDropCardModal;
    window.closeDropActionModal = closeDropActionModal;
    window.executeDropPlayCard = executeDropPlayCard;
    window.executeDropDefenseAttack = executeDropDefenseAttack;
    window.executeUseKobanSet = executeUseKobanSet;
    window.executeUseOban = executeUseOban;
    window.chooseBonusChoice = chooseBonusChoice;
    window.toggleBonusSkip = toggleBonusSkip;
    window.openTimeBombModal = openTimeBombModal;
    window.closeTimeBombModal = closeTimeBombModal;
    window.executeTransferTimeBomb = executeTransferTimeBomb;

})(window);