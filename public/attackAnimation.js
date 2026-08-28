/**
 * 攻撃カットインアニメーション制御モジュール (attackAnimation.js)
 * 「木の盾」「青銅の盾」「木の剣」の突進演出および「ショットガン」の射撃・貫通演出をシームレスに再生します。
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
        const results = data.results || [];
        const isGunAttack = (card.id === 'shotgun');

        // 1. ステージ初期化
        stage.innerHTML = `
            <div class="cutin-attacker-unit" id="cutin-attacker">
                <div class="cutin-attacker-info">
                    <img src="${attacker.avatar || '/images/avatars/avatar_default.png'}" class="cutin-avatar-attacker" alt="${attacker.name}" onerror="this.src='/images/avatars/avatar_default.png'">
                    <span class="cutin-player-name">${attacker.name}</span>
                </div>
                <div style="position:relative; display:inline-block;">
                    <img src="${card.image || '/images/wood_shield.png'}" class="cutin-card-img-attacker" alt="${card.name}">
                    ${isGunAttack ? '<div class="cutin-muzzle-flash" id="cutin-muzzle-flash"></div>' : ''}
                </div>
            </div>
            ${isGunAttack ? '<div class="cutin-bullet-tracer" id="cutin-bullet"></div>' : ''}
            <div class="cutin-defenders-group" id="cutin-defenders-group"></div>
        `;

        const defendersGroup = document.getElementById('cutin-defenders-group');
        const defenderUnitMap = {};

        // 2. ディフェンダーユニットを横並び生成
        defenders.forEach((def) => {
            const unit = document.createElement('div');
            unit.className = 'cutin-defender-unit';
            unit.id = `cutin-def-${def.id}`;

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

        // 3. レイヤーを表示
        layer.classList.add('active');

        // 4. 攻撃シーケンスの実行
        let currentIndex = 0;

        function runNextTargetSequence() {
            if (currentIndex >= results.length) {
                finishAnimation();
                return;
            }

            const step = results[currentIndex];
            const targetDef = defenders.find(d => d.id === step.targetId);
            const defUnit = defenderUnitMap[step.targetId];

            if (!targetDef || !defUnit) {
                currentIndex++;
                runNextTargetSequence();
                return;
            }

            const badgeEl = document.getElementById(`cutin-badge-${step.targetId}`);
            const defCardEl = document.getElementById(`cutin-def-card-${step.targetId}`);
            const auraEl = document.getElementById(`cutin-aura-${step.targetId}`);

            const stageRect = stage.getBoundingClientRect();
            const defRect = defUnit.getBoundingClientRect();

            if (isGunAttack) {
                // ==========================================
                // 【ショットガン専用：射撃・弾道アニメーション】
                // ==========================================
                const startX = 240; // 銃口位置
                const targetImpactX = (defRect.left - stageRect.left) + 20;

                // 射撃（マズルフラッシュ＋反動リコイル）
                if (currentIndex === 0) {
                    attackerEl.classList.add('recoil-action');
                    if (muzzleFlashEl) {
                        muzzleFlashEl.classList.add('fire');
                    }
                }

                if (bulletEl) {
                    bulletEl.classList.add('active');
                    bulletEl.style.left = `${startX}px`;
                    bulletEl.style.transition = 'left 0.22s linear';
                    void bulletEl.offsetWidth; // リフロー
                    bulletEl.style.left = `${targetImpactX}px`;
                }

                setTimeout(() => {
                    if (step.result === 'MISS') {
                        // 【回避】弾丸がそのまま右へ通過
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
                            currentIndex++;
                            runNextTargetSequence();
                        }, 480);

                    } else if (step.result === 'HIT') {
                        // 【命中】着弾・炸裂
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

                        setTimeout(() => {
                            finishAnimation();
                        }, 850);

                    } else if (step.result === 'BLOCK_PIERCED') {
                        // 【防御貫通】防御カードごと打ち抜いて吹き飛ぶ
                        if (bulletEl) bulletEl.classList.remove('active');
                        if (step.defCardImage && defCardEl) {
                            defCardEl.src = step.defCardImage;
                        }
                        if (defCardEl) {
                            defCardEl.classList.add('show');
                        }

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

                            setTimeout(() => {
                                finishAnimation();
                            }, 850);
                        }, 120);

                    } else if (step.result === 'INVINCIBLE' || step.result === 'STEROID') {
                        // 【無敵 / ステロイド】弾丸がバリアに弾かれて消滅
                        if (bulletEl) bulletEl.classList.remove('active');
                        if (auraEl) auraEl.classList.add('show');

                        if (badgeEl) {
                            badgeEl.innerText = step.result === 'INVINCIBLE' ? '無敵！' : 'ステロイド！';
                            badgeEl.className = 'cutin-result-badge badge-invincible show';
                        }

                        setTimeout(() => {
                            finishAnimation();
                        }, 850);
                    }
                }, 220);

            } else {
                // ==========================================
                // 【突進型アニメーション（木の盾・青銅の盾・木の剣）】
                // ==========================================
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
                            currentIndex++;
                            runNextTargetSequence();
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

                        setTimeout(() => {
                            finishAnimation();
                        }, 850);

                    } else if (step.result === 'BLOCK') {
                        if (step.defCardImage && defCardEl) {
                            defCardEl.src = step.defCardImage;
                        }
                        if (defCardEl) defCardEl.classList.add('show');

                        if (badgeEl) {
                            badgeEl.innerText = '防御！';
                            badgeEl.className = 'cutin-result-badge badge-block show';
                        }
                        attackerEl.classList.add('attacker-knockback');

                        setTimeout(() => {
                            finishAnimation();
                        }, 850);

                    } else if (step.result === 'INVINCIBLE' || step.result === 'STEROID') {
                        if (auraEl) auraEl.classList.add('show');

                        if (badgeEl) {
                            badgeEl.innerText = step.result === 'INVINCIBLE' ? '無敵！' : 'ステロイド！';
                            badgeEl.className = 'cutin-result-badge badge-invincible show';
                        }
                        attackerEl.classList.add('attacker-knockback');

                        setTimeout(() => {
                            finishAnimation();
                        }, 850);
                    }
                }, 360);
            }
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

        setTimeout(runNextTargetSequence, 350);
    }

    // グローバル公開
    window.AttackAnimation = {
        play: playAttackCutin
    };

})(window);