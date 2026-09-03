/**
 * 攻撃カットインアニメーション制御モジュール (attackAnimation.js)
 * 突進（盾・剣）、射撃（ショットガン）、手榴弾投擲（グレネード）、天空刺突（ダイヤの剣）、闇の広域爆発（ダークマター）、黄金解放（バフ解除）、煙幕（スモーク）に対応
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
        const isDiamondSword = (card.id === 'diamond_sword');
        const isDarkMatter = (card.id === 'dark_matter');
        const isSmokeScreen = (card.id === 'smoke_screen') || !!data.smokeScreenAction;
        const isBuffExpire = !!data.buffExpireAction;

        const rounds = data.rounds || (data.results ? [{ roundNumber: 1, results: data.results }] : []);

        if (rounds.length === 0 && !data.grenadeAction && !data.diamondSwordAction && !data.darkMatterAction && !data.buffExpireAction && !data.smokeScreenAction) {
            if (onComplete) onComplete();
            return;
        }

        // ==========================================
        // 【煙幕専用：使用者非表示＆煙玉落下・煙幕拡散】
        // ==========================================
        if (isSmokeScreen && data.smokeScreenAction) {
            const action = data.smokeScreenAction;
            const victims = action.victims || [];
            const victimCount = victims.length;

            stage.innerHTML = `
                <img src="/images/smoke_bomb.png" class="cutin-smoke-bomb" id="cutin-smoke-bomb" alt="煙玉" onerror="this.src='/images/smoke_screen.png'">
                <img src="/images/smoke_cloud.png" class="cutin-smoke-cloud" id="cutin-smoke-cloud" alt="煙幕" onerror="this.src='/images/smoke_screen.png'">
                <div class="cutin-smoke-stage-container" id="cutin-smoke-stage-container"></div>
            `;

            const container = document.getElementById('cutin-smoke-stage-container');
            const smokeBombEl = document.getElementById('cutin-smoke-bomb');
            const smokeCloudEl = document.getElementById('cutin-smoke-cloud');

            let offsets = [];
            if (victimCount === 1) {
                offsets = [0]; // [対象 (中央: 50%)]
            } else if (victimCount === 2) {
                offsets = [-130, 130]; // [対象A] ── [対象B]
            } else if (victimCount === 3) {
                offsets = [-220, 0, 220]; // [対象A] ─ [対象B] ─ [対象C]
            }

            // 対象ユニット群を静止状態で中央対称配置
            victims.forEach((v, idx) => {
                const defEl = document.createElement('div');
                defEl.className = 'cutin-smoke-defender-unit';
                defEl.id = `cutin-smoke-def-${v.id}`;

                const offsetVal = offsets[idx] || (140 * (idx - 1));
                defEl.style.left = `calc(50% + ${offsetVal}px)`;

                const isProtected = (v.result === 'PROTECTED');

                defEl.innerHTML = `
                    <img src="${v.avatar || '/images/avatars/avatar_default.png'}" class="cutin-avatar-defender" alt="${v.name}" onerror="this.src='/images/avatars/avatar_default.png'">
                    <span class="cutin-player-name">${v.name}</span>
                    <div class="cutin-invincible-aura ${isProtected ? 'show' : ''}"></div>
                `;

                container.appendChild(defEl);
            });

            layer.classList.add('active');

            setTimeout(() => {
                // 1. 煙玉急降下
                if (smokeBombEl) smokeBombEl.classList.add('fall');

                setTimeout(() => {
                    // 2. 着弾＆煙幕大拡散
                    if (smokeBombEl) smokeBombEl.style.opacity = '0';
                    if (smokeCloudEl) smokeCloudEl.classList.add('spread');

                    if (flash) {
                        flash.classList.remove('flash');
                        void flash.offsetWidth;
                        flash.classList.add('flash');
                    }

                    setTimeout(() => {
                        layer.classList.remove('active');
                        setTimeout(() => {
                            stage.innerHTML = '';
                            if (onComplete) onComplete();
                        }, 280);
                    }, 2000);
                }, 350);
            }, 250);
            return;
        }

        // ==========================================
        // 【バフ解除専用：中央完全固定＆黄金ショックウェーブ解放】
        // ==========================================
        if (isBuffExpire && data.buffExpireAction) {
            const action = data.buffExpireAction;
            const victims = action.victims || [];
            const victimCount = victims.length;

            stage.innerHTML = `
                <div class="cutin-buff-expire-blast" id="cutin-buff-expire-blast"></div>
                <div class="cutin-expire-stage-container" id="cutin-expire-stage-container"></div>
            `;

            const container = document.getElementById('cutin-expire-stage-container');
            const blastEl = document.getElementById('cutin-buff-expire-blast');

            const selfUnit = document.createElement('div');
            selfUnit.className = 'cutin-expire-self-unit';
            selfUnit.id = 'cutin-expire-self';
            selfUnit.innerHTML = `
                <div class="cutin-result-badge show" style="color:#f1c40f; font-size:18px;">解除！</div>
                <img src="${attacker.avatar || '/images/avatars/avatar_default.png'}" class="cutin-avatar-attacker" style="border-color:#f1c40f; width:72px; height:72px;" alt="${attacker.name}" onerror="this.src='/images/avatars/avatar_default.png'">
                <span class="cutin-player-name">${attacker.name}</span>
                <div class="cutin-invincible-aura show" id="cutin-aura-self"></div>
            `;
            container.appendChild(selfUnit);

            const defenderUnitMap = {};

            let offsets = [];
            if (victimCount === 1) {
                offsets = [150];
            } else if (victimCount === 2) {
                offsets = [-160, 160];
            } else if (victimCount === 3) {
                offsets = [-260, -130, 170];
            }

            victims.forEach((v, idx) => {
                const defEl = document.createElement('div');
                defEl.className = 'cutin-expire-defender-unit';
                defEl.id = `cutin-def-${v.id}`;
                defEl.setAttribute('data-index', idx);

                const offsetVal = offsets[idx] || (150 * (idx + 1));
                defEl.style.left = `calc(50% + ${offsetVal}px)`;
                defEl.setAttribute('data-side', offsetVal < 0 ? 'left' : 'right');

                defEl.innerHTML = `
                    <div class="cutin-result-badge" id="cutin-badge-${v.id}"></div>
                    <img src="${v.avatar || '/images/avatars/avatar_default.png'}" class="cutin-avatar-defender" alt="${v.name}" onerror="this.src='/images/avatars/avatar_default.png'">
                    <span class="cutin-player-name">${v.name}</span>
                    <img src="/images/wood_shield.png" class="cutin-def-shield-card" id="cutin-def-card-${v.id}" alt="防御カード">
                    <div class="cutin-invincible-aura" id="cutin-aura-${v.id}"></div>
                `;

                container.appendChild(defEl);
                defenderUnitMap[v.id] = defEl;
            });

            layer.classList.add('active');

            setTimeout(() => {
                if (blastEl) blastEl.classList.add('explode');

                if (flash) {
                    flash.classList.remove('flash');
                    void flash.offsetWidth;
                    flash.classList.add('flash');
                }

                victims.forEach((v) => {
                    const vUnit = defenderUnitMap[v.id];
                    if (!vUnit) return;

                    const vBadge = document.getElementById(`cutin-badge-${v.id}`);
                    const vCard = document.getElementById(`cutin-def-card-${v.id}`);
                    const vAura = document.getElementById(`cutin-aura-${v.id}`);

                    const side = vUnit.getAttribute('data-side');
                    const blowClass = (side === 'left') ? 'blow-left-up' : 'blow-right-up';

                    if (v.result === 'PROTECTED') {
                        if (vAura) vAura.classList.add('show');
                        if (vBadge) {
                            vBadge.innerText = v.protectText || '無敵！';
                            vBadge.className = 'cutin-result-badge badge-invincible show';
                        }
                    } else if (v.result === 'MISS') {
                        if (vBadge) {
                            vBadge.innerText = '回避！';
                            vBadge.className = 'cutin-result-badge badge-dodge show';
                        }
                        vUnit.classList.add('dodge-action');
                    } else {
                        if (vCard && v.hasDefenseCard) {
                            vCard.classList.add('broken');
                        }
                        if (vBadge) {
                            vBadge.innerText = '命中！';
                            vBadge.className = 'cutin-result-badge badge-hit show';
                        }
                        vUnit.classList.add(blowClass);
                    }
                });

                setTimeout(() => {
                    layer.classList.remove('active');
                    setTimeout(() => {
                        stage.innerHTML = '';
                        if (onComplete) onComplete();
                    }, 280);
                }, 1050);
            }, 450);
            return;
        }

        // 1. 通常攻撃用ステージ初期化
        stage.innerHTML = `
            <div class="cutin-attacker-unit" id="cutin-attacker" style="${isDiamondSword ? 'display: none !important;' : ''}">
                <div class="cutin-attacker-info">
                    <img src="${attacker.avatar || '/images/avatars/avatar_default.png'}" class="cutin-avatar-attacker" alt="${attacker.name}" onerror="this.src='/images/avatars/avatar_default.png'">
                    <span class="cutin-player-name">${attacker.name}</span>
                    <div class="cutin-result-badge" id="cutin-badge-attacker"></div>
                    <div class="cutin-invincible-aura" id="cutin-aura-attacker"></div>
                </div>
                <div style="position:relative; display:inline-block;">
                    <img src="${card.image || '/images/dark_matter.png'}" class="cutin-card-img-attacker" alt="${card.name}">
                    ${isGunAttack ? '<div class="cutin-muzzle-flash" id="cutin-muzzle-flash"></div>' : ''}
                </div>
            </div>
            ${isGunAttack ? '<div class="cutin-bullet-tracer" id="cutin-bullet"></div>' : ''}
            ${isGrenadeAttack ? '<img src="/images/grenade_bomb.png" class="cutin-grenade-bomb" id="cutin-grenade" alt="手榴弾">' : ''}
            ${isGrenadeAttack ? '<div class="cutin-explosion-blast" id="cutin-explosion"></div>' : ''}
            ${isDarkMatter ? '<img src="/images/dark_matter_orb.png" class="cutin-dark-matter-orb" id="cutin-dark-matter-orb" alt="ダークマター" onerror="this.src=\'/images/dark_matter.png\'">' : ''}
            ${isDarkMatter ? '<div class="cutin-dark-matter-blast" id="cutin-dark-matter-blast"></div>' : ''}
            ${isDiamondSword ? '<img src="/images/diamond_sword_weapon.png" class="cutin-diamond-sword-weapon" id="cutin-diamond-sword" alt="ダイヤの剣" onerror="this.src=\'/images/diamond_sword.png\'">' : ''}
            ${isDiamondSword ? '<div class="cutin-crystal-explosion-blast" id="cutin-crystal-explosion"></div>' : ''}
            <div class="cutin-defenders-group ${isDiamondSword ? 'center-aligned' : ''}" id="cutin-defenders-group"></div>
        `;

        const defendersGroup = document.getElementById('cutin-defenders-group');
        const defenderUnitMap = {};
        const aliveDefenderIds = new Set(defenders.map(d => d.id));

        // 2. ディフェンダーユニットを整列生成
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
        const darkMatterOrbEl = document.getElementById('cutin-dark-matter-orb');
        const darkMatterBlastEl = document.getElementById('cutin-dark-matter-blast');
        const diamondSwordEl = document.getElementById('cutin-diamond-sword');
        const crystalExplosionEl = document.getElementById('cutin-crystal-explosion');

        layer.classList.add('active');

        // ==========================================
        // 【ダークマター専用：闇のオーブ投擲＆広域大爆発】
        // ==========================================
        if (isDarkMatter && data.darkMatterAction) {
            const action = data.darkMatterAction;
            const victims = action.victims || [];

            setTimeout(() => {
                const stageRect = stage.getBoundingClientRect();
                const defendersGroupRect = defendersGroup.getBoundingClientRect();

                const targetCenterX = (defendersGroupRect.left - stageRect.left) + (defendersGroupRect.width / 2);
                const targetCenterY = (defendersGroupRect.top - stageRect.top) + (defendersGroupRect.height / 2);

                if (darkMatterOrbEl) {
                    darkMatterOrbEl.classList.add('active');
                    darkMatterOrbEl.style.left = '220px';
                    darkMatterOrbEl.style.top = '50%';
                    darkMatterOrbEl.style.transform = 'translateY(-50%) rotate(0deg) scale(0.6)';

                    darkMatterOrbEl.style.transition = 'left 0.45s linear, top 0.45s cubic-bezier(0.2, 0.8, 0.4, 1), transform 0.45s linear';
                    void darkMatterOrbEl.offsetWidth;
                    darkMatterOrbEl.style.left = `${targetCenterX - 37}px`;
                    darkMatterOrbEl.style.top = `${targetCenterY - 37}px`;
                    darkMatterOrbEl.style.transform = 'translateY(-50%) rotate(720deg) scale(1.1)';
                }

                setTimeout(() => {
                    if (darkMatterOrbEl) darkMatterOrbEl.classList.remove('active');

                    if (darkMatterBlastEl) {
                        darkMatterBlastEl.style.left = `${targetCenterX}px`;
                        darkMatterBlastEl.style.top = `${targetCenterY}px`;
                        darkMatterBlastEl.classList.add('explode');
                    }

                    if (flash) {
                        flash.classList.remove('flash');
                        void flash.offsetWidth;
                        flash.classList.add('flash');
                    }

                    const totalDefs = defenders.length;

                    victims.forEach((v) => {
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
                            if (vAura) vAura.classList.add('show');
                            if (vBadge) {
                                vBadge.innerText = v.protectText || '無敵！';
                                vBadge.className = 'cutin-result-badge badge-invincible show';
                            }
                        } else if (v.result === 'MISS') {
                            if (vBadge) {
                                vBadge.innerText = '回避！';
                                vBadge.className = 'cutin-result-badge badge-dodge show';
                            }
                            vUnit.classList.add('dodge-action');
                        } else {
                            if (vCard && v.hasDefenseCard) {
                                vCard.classList.add('broken');
                            }
                            if (vBadge) {
                                vBadge.innerText = '命中！';
                                vBadge.className = 'cutin-result-badge badge-hit show';
                            }
                            vUnit.classList.add(blowClass);
                        }
                    });

                    setTimeout(finishAnimation, 1050);
                }, 450);
            }, 300);
            return;
        }

        // ==========================================
        // 【ダイヤの剣専用：天空刺突＆クリスタル大爆発】
        // ==========================================
        if (isDiamondSword && data.diamondSwordAction) {
            const action = data.diamondSwordAction;
            const victims = action.victims || [];
            const primaryTargetId = action.primaryTargetId;
            const primaryUnit = defenderUnitMap[primaryTargetId];

            setTimeout(() => {
                const stageRect = stage.getBoundingClientRect();
                const defendersGroupRect = defendersGroup.getBoundingClientRect();

                let targetCenterX = (defendersGroupRect.left - stageRect.left) + (defendersGroupRect.width / 2);
                let targetCenterY = (defendersGroupRect.top - stageRect.top) + (defendersGroupRect.height / 2);

                if (primaryUnit) {
                    const pRect = primaryUnit.getBoundingClientRect();
                    targetCenterX = (pRect.left - stageRect.left) + (pRect.width / 2);
                }

                if (diamondSwordEl) {
                    diamondSwordEl.style.left = `${targetCenterX}px`;
                    diamondSwordEl.classList.add('fall');
                }

                setTimeout(() => {
                    if (crystalExplosionEl) {
                        crystalExplosionEl.style.left = `${targetCenterX}px`;
                        crystalExplosionEl.style.top = `${targetCenterY}px`;
                        crystalExplosionEl.classList.add('explode');
                    }

                    if (flash) {
                        flash.classList.remove('flash');
                        void flash.offsetWidth;
                        flash.classList.add('flash');
                    }

                    const totalDefs = defenders.length;

                    victims.forEach((v) => {
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
                        } else if (v.result === 'DODGE') {
                            if (vCard && v.hasDefenseCard) {
                                vCard.classList.add('broken');
                            }
                            if (vBadge) {
                                vBadge.innerText = '回避！';
                                vBadge.className = 'cutin-result-badge badge-dodge show';
                            }
                            vUnit.classList.add('dodge-action');
                        } else {
                            if (vCard && v.hasDefenseCard) {
                                vCard.classList.add('broken');
                            }
                            if (vBadge) {
                                vBadge.innerText = '命中！';
                                vBadge.className = 'cutin-result-badge badge-hit show';
                            }
                            vUnit.classList.add(blowClass);
                        }
                    });

                    setTimeout(finishAnimation, 1050);
                }, 450);
            }, 300);
            return;
        }

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