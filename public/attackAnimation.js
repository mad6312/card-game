/**
 * 攻撃カットインアニメーション制御モジュール (attackAnimation.js)
 * 突進（盾・剣）、射撃（ショットガン）、手榴弾投擲＆同時大爆発（グレネード）に対応
 */

(function (window) {
    'use strict';

    // カットイン用DOM要素の取得
    function getCutinElements() {
        return {
            layer: document.getElementById('attack-cutin-layer'),
            stage: document.getElementById('attack-cutin-stage'),
            flash: document.getElementById('cutin-flash-overlay')
        };
    }

    /**
     * 攻撃アニメーションのメイン実行関数
     * @param {Object} data 演出定義データ
     * @param {Function} onComplete アニメーション完了時コールバック
     */
    function playAttackCutin(data, onComplete) {
        const { layer, stage, flash } = getCutinElements();
        if (!layer || !stage) {
            if (onComplete) onComplete();
            return;
        }

        const attacker = data.attacker;
        const card = data.card;
        const defenders = data.defenders || [];
        const isGunAttack = (card.id === 'shotgun');
        const isGrenadeAttack = (card.id === 'grenade');

        const rounds = data.rounds || (data.results ? [{ roundNumber: 1, results: data.results }] : []);

        if (rounds.length === 0 && !data.grenadeAction) {
            if (onComplete) onComplete();
            return;
        }

        // 1. ステージ初期化（手榴弾画像のフォールバック保護付き）
        stage.innerHTML = `
            <div class="cutin-attacker-unit" id="cutin-attacker">
                <div class="cutin-attacker-info">
                    <img src="${attacker.avatar || '/images/avatars/avatar_default.png'}" class="cutin-avatar-attacker" alt="${attacker.name}" onerror="this.src='/images/avatars/avatar_default.png'">
                    <span class="cutin-player-name">${attacker.name}</span>
                    <div class="cutin-result-badge" id="cutin-badge-attacker"></div>
                    <div class="cutin-invincible-aura" id="cutin-aura-attacker"></div>
                </div>
                <div style="position:relative; display:inline-block;">
                    <img src="${card.image || '/images/wood_shield.png'}" class="cutin-card-img-attacker" alt="${card.name}">
                    ${isGunAttack ? '<div class="cutin-muzzle-flash" id="cutin-muzzle-flash"></div>' : ''}
                </div>
            </div>
            ${isGunAttack ? '<div class="cutin-bullet-tracer" id="cutin-bullet"></div>' : ''}
            ${isGrenadeAttack ? '<img src="/images/grenade_bomb.png" class="cutin-grenade-bomb" id="cutin-grenade" alt="" onerror="if(this.src.indexOf(\'PNG\')===-1){this.src=\'/images/grenade_bomb.PNG\';}else{this.src=\'/images/grenade.png\';}">' : ''}
            ${isGrenadeAttack ? '<div class="cutin-explosion-blast" id="cutin-explosion"></div>' : ''}
            <div class="cutin-defenders-group" id="cutin-defenders-group"></div>
        `;

        const defendersGroup = document.getElementById('cutin-defenders-group');
        const defenderUnitMap = {};
        const aliveDefenderIds = new Set(defenders.map(d => d.id));

        // 2. ディフェンダーユニットを横並び生成
        defenders.forEach((def, idx) => {
            const unit = document.createElement('div');
            unit.className = 'cutin-defender-unit';
            unit.id = `cutin-def-${def.id}`;
            unit.setAttribute('data-index', idx);

            unit.innerHTML = `
                <div class="cutin-result-badge" id="cutin-badge-${def.id}"></div>
                <img src="${def.avatar || '/images/avatars/avatar_default.png'}" class="cutin-avatar-defender" alt="${def.name}" onerror="this.src='/images/avatars/avatar_default.png'">
                <span class="cutin-player-name">${def.name}</span>
                <img src="/images/wood_shield.png" class="cutin-def-shield-card" id="cutin-def-card-${def.id}" alt="防御カード">
                <div class="cutin-invincible-aura" id="cutin-aura-${def.id}"></div>
            `;

            defendersGroup.appendChild(unit);
            defenderUnitMap[def.id] = unit;
        });

        const attackerEl = document.getElementById('cutin-attacker');
        const muzzleFlashEl = document.getElementById('cutin-muzzle-flash');
        const bulletEl = document.getElementById('cutin-bullet');
        const grenadeEl = document.getElementById('cutin-grenade');
        const explosionEl = document.getElementById('cutin-explosion');

        layer.classList.add('active');

        // ==========================================
        // 【グレネード専用：手榴弾投擲＆同時大爆発演出】
        // ==========================================
        if (isGrenadeAttack && data.grenadeAction) {
            const action = data.grenadeAction;
            const steps = action.steps || [];
            let currentStepIdx = 0;

            function runNextGrenadeStep() {
                if (currentStepIdx >= steps.length) {
                    finishAnimation();
                    return;
                }

                const currentStep = steps[currentStepIdx];
                const primaryTargetId = currentStep.primaryTargetId;
                const primaryUnit = defenderUnitMap[primaryTargetId];

                if (!primaryUnit) {
                    currentStepIdx++;
                    runNextGrenadeStep();
                    return;
                }

                const stageRect = stage.getBoundingClientRect();
                const defendersGroupRect = defendersGroup.getBoundingClientRect();

                const targetCenterX = (defendersGroupRect.left - stageRect.left) + (defendersGroupRect.width / 2);
                const targetCenterY = (defendersGroupRect.top - stageRect.top) + (defendersGroupRect.height / 2);

                if (grenadeEl) {
                    grenadeEl.classList.add('active');
                    grenadeEl.style.left = '220px';
                    grenadeEl.style.top = '50%';
                    grenadeEl.style.transform = 'translateY(-50%) rotate(0deg)';

                    grenadeEl.style.transition = 'left 0.45s linear, top 0.45s cubic-bezier(0.2, 0.8, 0.4, 1), transform 0.45s linear';
                    void grenadeEl.offsetWidth;
                    grenadeEl.style.left = `${targetCenterX - 25}px`;
                    grenadeEl.style.top = `${targetCenterY - 30}px`;
                    grenadeEl.style.transform = 'translateY(-50%) rotate(720deg) scale(0.9)';
                }

                setTimeout(() => {
                    if (currentStep.isMiss) {
                        const primaryBadge = document.getElementById(`cutin-badge-${primaryTargetId}`);
                        if (primaryBadge) {
                            primaryBadge.innerText = '回避！';
                            primaryBadge.className = 'cutin-result-badge badge-dodge show';
                        }
                        primaryUnit.classList.add('dodge-action');

                        if (grenadeEl) {
                            grenadeEl.style.transition = 'top 0.25s ease-out, transform 0.25s ease-out';
                            grenadeEl.style.top = `${targetCenterY + 40}px`;
                            grenadeEl.style.transform = 'translateY(-50%) rotate(900deg) scale(0.6)';
                        }

                        setTimeout(() => {
                            currentStepIdx++;
                            runNextGrenadeStep();
                        }, 550);

                    } else {
                        if (grenadeEl) grenadeEl.classList.remove('active');

                        if (explosionEl) {
                            explosionEl.style.left = `${targetCenterX}px`;
                            explosionEl.style.top = `${targetCenterY}px`;
                            explosionEl.classList.add('explode');
                        }

                        if (flash) {
                            flash.classList.remove('flash');
                            void flash.offsetWidth;
                            flash.classList.add('flash');
                        }

                        const victims = currentStep.victims || [];
                        const totalDefs = defenders.length;

                        victims.forEach((v) => {
                            if (v.id === attacker.id) {
                                const selfBadge = document.getElementById('cutin-badge-attacker');
                                const selfAura = document.getElementById('cutin-aura-attacker');

                                if (v.result === 'PROTECTED') {
                                    if (selfAura) selfAura.classList.add('show');
                                    if (selfBadge) {
                                        selfBadge.innerText = v.protectText || '無敵！';
                                        selfBadge.className = 'cutin-result-badge badge-invincible show';
                                    }
                                } else {
                                    if (selfBadge) {
                                        selfBadge.innerText = '命中！';
                                        selfBadge.className = 'cutin-result-badge badge-hit show';
                                    }
                                    attackerEl.classList.add('blow-self-left');
                                }
                                return;
                            }

                            const vUnit = defenderUnitMap[v.id];
                            if (!vUnit) return;

                            const vBadge = document.getElementById(`cutin-badge-${v.id}`);
                            const vCard = document.getElementById(`cutin-def-card-${v.id}`);
                            const vAura = document.getElementById(`cutin-aura-${v.id}`);
                            const defIdx = Number(vUnit.getAttribute('data-index') || 0);

                            let blowClass = 'blow-straight-up';
                            if (totalDefs === 1) {
                                blowClass = 'blow-straight-up';
                            } else if (totalDefs === 2) {
                                blowClass = (defIdx === 0) ? 'blow-left-up' : 'blow-right-up';
                            } else {
                                if (defIdx === 0) blowClass = 'blow-left-up';
                                else if (defIdx === totalDefs - 1) blowClass = 'blow-right-up';
                                else blowClass = 'blow-straight-up';
                            }

                            if (v.result === 'PROTECTED') {
                                if (vCard && v.hasDefenseCard) {
                                    vCard.classList.add('broken');
                                }
                                if (vAura) vAura.classList.add('show');
                                if (vBadge) {
                                    vBadge.innerText = v.protectText || '無敵！';
                                    vBadge.className = 'cutin-result-badge badge-invincible show';
                                }
                            } else if (v.result === 'BLOCK_PIERCED') {
                                if (vCard) {
                                    if (v.defCardImage) vCard.src = v.defCardImage;
                                    vCard.classList.add('broken');
                                }
                                if (vBadge) {
                                    vBadge.innerText = '貫通！';
                                    vBadge.className = 'cutin-result-badge badge-pierce show';
                                }
                                vUnit.classList.add(blowClass);
                            } else {
                                if (vBadge) {
                                    vBadge.innerText = '命中！';
                                    vBadge.className = 'cutin-result-badge badge-hit show';
                                }
                                vUnit.classList.add(blowClass);
                            }
                        });

                        setTimeout(finishAnimation, 950);
                    }
                }, 460);
            }

            setTimeout(runNextGrenadeStep, 350);
            return;
        }

        // ==========================================
        // 【通常突進型・射撃型の連撃ループ制御】
        // ==========================================
        let currentRoundIndex = 0;

        function runNextRound() {
            if (currentRoundIndex >= rounds.length || aliveDefenderIds.size === 0) {
                finishAnimation();
                return;
            }

            const currentRound = rounds[currentRoundIndex];
            const roundResults = currentRound.results || [];
            let stepIndex = 0;

            attackerEl.style.transition = 'transform 0.22s ease-out';
            attackerEl.style.transform = 'translate(0, -50%)';
            attackerEl.classList.remove('attacker-knockback', 'recoil-action');

            function runNextStepInRound() {
                if (stepIndex >= roundResults.length) {
                    currentRoundIndex++;
                    setTimeout(runNextRound, 450);
                    return;
                }

                const step = roundResults[stepIndex];
                const targetDef = defenders.find(d => d.id === step.targetId);
                const defUnit = defenderUnitMap[step.targetId];

                if (!targetDef || !defUnit || !aliveDefenderIds.has(step.targetId)) {
                    stepIndex++;
                    runNextStepInRound();
                    return;
                }

                const badgeEl = document.getElementById(`cutin-badge-${step.targetId}`);
                const defCardEl = document.getElementById(`cutin-def-card-${step.targetId}`);
                const auraEl = document.getElementById(`cutin-aura-${step.targetId}`);

                if (badgeEl) badgeEl.className = 'cutin-result-badge';

                const stageRect = stage.getBoundingClientRect();
                const defRect = defUnit.getBoundingClientRect();

                if (isGunAttack) {
                    const startX = 240;
                    const targetImpactX = (defRect.left - stageRect.left) + 20;

                    if (stepIndex === 0) {
                        attackerEl.classList.add('recoil-action');
                        if (muzzleFlashEl) muzzleFlashEl.classList.add('fire');
                    }

                    if (bulletEl) {
                        bulletEl.classList.add('active');
                        bulletEl.style.left = `${startX}px`;
                        bulletEl.style.transition = 'left 0.22s linear';
                        void bulletEl.offsetWidth;
                        bulletEl.style.left = `${targetImpactX}px`;
                    }

                    setTimeout(() => {
                        if (step.result === 'MISS') {
                            if (badgeEl) {
                                badgeEl.innerText = '回避！';
                                badgeEl.className = 'cutin-result-badge badge-dodge show';
                            }
                            defUnit.classList.add('dodge-action');

                            if (bulletEl) {
                                bulletEl.style.transition = 'left 0.2s linear';
                                bulletEl.style.left = `${targetImpactX + 160}px`;
                            }

                            setTimeout(() => {
                                stepIndex++;
                                runNextStepInRound();
                            }, 480);

                        } else if (step.result === 'HIT') {
                            if (bulletEl) bulletEl.classList.remove('active');
                            if (flash) {
                                flash.classList.remove('flash');
                                void flash.offsetWidth;
                                flash.classList.add('flash');
                            }

                            if (badgeEl) {
                                badgeEl.innerText = '命中！';
                                badgeEl.className = 'cutin-result-badge badge-hit show';
                            }
                            defUnit.classList.add('blown-away-action');
                            aliveDefenderIds.delete(step.targetId);

                            setTimeout(() => {
                                currentRoundIndex++;
                                runNextRound();
                            }, 750);

                        } else if (step.result === 'BLOCK_PIERCED') {
                            if (bulletEl) bulletEl.classList.remove('active');
                            if (step.defCardImage && defCardEl) defCardEl.src = step.defCardImage;
                            if (defCardEl) defCardEl.classList.add('show');

                            setTimeout(() => {
                                if (flash) {
                                    flash.classList.remove('flash');
                                    void flash.offsetWidth;
                                    flash.classList.add('flash');
                                }

                                if (badgeEl) {
                                    badgeEl.innerText = '貫通！';
                                    badgeEl.className = 'cutin-result-badge badge-pierce show';
                                }
                                if (defCardEl) defCardEl.classList.add('broken');
                                defUnit.classList.add('blown-away-action');
                                aliveDefenderIds.delete(step.targetId);

                                setTimeout(() => {
                                    currentRoundIndex++;
                                    runNextRound();
                                }, 750);
                            }, 120);

                        } else if (step.result === 'INVINCIBLE' || step.result === 'STEROID') {
                            if (bulletEl) bulletEl.classList.remove('active');
                            if (auraEl) auraEl.classList.add('show');

                            if (badgeEl) {
                                badgeEl.innerText = step.result === 'INVINCIBLE' ? '無敵！' : 'ステロイド！';
                                badgeEl.className = 'cutin-result-badge badge-invincible show';
                            }

                            setTimeout(finishAnimation, 850);
                        }
                    }, 220);

                } else {
                    const targetX = (defRect.left - stageRect.left) - 150;

                    attackerEl.style.transition = 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)';
                    attackerEl.style.transform = `translate(${targetX}px, -50%)`;

                    setTimeout(() => {
                        if (step.result === 'MISS') {
                            if (badgeEl) {
                                badgeEl.innerText = '回避！';
                                badgeEl.className = 'cutin-result-badge badge-dodge show';
                            }
                            defUnit.classList.add('dodge-action');

                            setTimeout(() => {
                                stepIndex++;
                                runNextStepInRound();
                            }, 500);

                        } else if (step.result === 'HIT') {
                            if (flash) {
                                flash.classList.remove('flash');
                                void flash.offsetWidth;
                                flash.classList.add('flash');
                            }

                            if (badgeEl) {
                                badgeEl.innerText = '命中！';
                                badgeEl.className = 'cutin-result-badge badge-hit show';
                            }
                            defUnit.classList.add('blown-away-action');
                            aliveDefenderIds.delete(step.targetId);

                            setTimeout(() => {
                                currentRoundIndex++;
                                runNextRound();
                            }, 750);

                        } else if (step.result === 'BLOCK') {
                            if (step.defCardImage && defCardEl) defCardEl.src = step.defCardImage;
                            if (defCardEl) defCardEl.classList.add('show');

                            if (badgeEl) {
                                badgeEl.innerText = '防御！';
                                badgeEl.className = 'cutin-result-badge badge-block show';
                            }
                            attackerEl.classList.add('attacker-knockback');

                            setTimeout(() => {
                                currentRoundIndex++;
                                runNextRound();
                            }, 750);

                        } else if (step.result === 'INVINCIBLE' || step.result === 'STEROID') {
                            if (auraEl) auraEl.classList.add('show');

                            if (badgeEl) {
                                badgeEl.innerText = step.result === 'INVINCIBLE' ? '無敵！' : 'ステロイド！';
                                badgeEl.className = 'cutin-result-badge badge-invincible show';
                            }
                            attackerEl.classList.add('attacker-knockback');

                            setTimeout(finishAnimation, 850);
                        }
                    }, 360);
                }
            }

            runNextStepInRound();
        }

        function finishAnimation() {
            setTimeout(() => {
                layer.classList.remove('active');
                setTimeout(() => {
                    stage.innerHTML = '';
                    if (onComplete) onComplete();
                }, 280);
            }, 500);
        }

        setTimeout(runNextRound, 350);
    }

    window.AttackAnimation = {
        play: playAttackCutin
    };

})(window);