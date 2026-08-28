/**
 * 攻撃カットインアニメーション制御モジュール (attackAnimation.js)
 * 「木の盾」などの突進・回避・命中・防御・無敵演出をシームレスに再生します。
 */

(function (window) {
    'use strict';

    // カットイン用DOM要素の初期化取得
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

        // 1. ステージ初期化（既存ユニットのクリア）
        stage.innerHTML = `
            <div class="cutin-attacker-unit" id="cutin-attacker">
                <div class="cutin-attacker-info">
                    <img src="${attacker.avatar || '/images/avatars/avatar_default.png'}" class="cutin-avatar-attacker" alt="${attacker.name}" onerror="this.src='/images/avatars/avatar_default.png'">
                    <span class="cutin-player-name">${attacker.name}</span>
                </div>
                <img src="${card.image || '/images/wood_shield.png'}" class="cutin-card-img-attacker" alt="${card.name}">
            </div>
            <div class="cutin-defenders-group" id="cutin-defenders-group"></div>
        `;

        const defendersGroup = document.getElementById('cutin-defenders-group');
        const defenderUnitMap = {};

        // 2. ディフェンダーユニットを横並び生成
        defenders.forEach((def, index) => {
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

        // 3. レイヤーを表示
        layer.classList.add('active');

        // 4. 突進シーケンスの実行
        let currentIndex = 0;

        function runNextTargetSequence() {
            if (currentIndex >= results.length) {
                // 全結果終了
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

            // 攻撃側の目標突進座標を計算（対象の直前手前へ移動）
            const stageRect = stage.getBoundingClientRect();
            const defRect = defUnit.getBoundingClientRect();
            const targetX = (defRect.left - stageRect.left) - 150; // 手前150px

            attackerEl.style.transition = 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)';
            attackerEl.style.transform = `translate(${targetX}px, -50%)`;

            setTimeout(() => {
                // 判定結果に応じた演出分岐
                if (step.result === 'MISS') {
                    // 【回避】
                    if (badgeEl) {
                        badgeEl.innerText = '回避！';
                        badgeEl.className = 'cutin-result-badge badge-dodge show';
                    }
                    defUnit.classList.add('dodge-action');

                    // 攻撃側はそのまま直進して抜ける
                    setTimeout(() => {
                        currentIndex++;
                        runNextTargetSequence();
                    }, 500);

                } else if (step.result === 'HIT') {
                    // 【命中】
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
                    }, 800);

                } else if (step.result === 'BLOCK') {
                    // 【防御】
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
                    }, 800);

                } else if (step.result === 'INVINCIBLE' || step.result === 'STEROID') {
                    // 【無敵 / ステロイド】
                    if (auraEl) auraEl.classList.add('show');

                    if (badgeEl) {
                        badgeEl.innerText = step.result === 'INVINCIBLE' ? '無敵！' : 'ステロイド！';
                        badgeEl.className = 'cutin-result-badge badge-invincible show';
                    }

                    attackerEl.classList.add('attacker-knockback');

                    setTimeout(() => {
                        finishAnimation();
                    }, 800);
                }
            }, 360);
        }

        function finishAnimation() {
            setTimeout(() => {
                layer.classList.remove('active');
                setTimeout(() => {
                    stage.innerHTML = '';
                    if (onComplete) onComplete();
                }, 250);
            }, 500);
        }

        // 開幕0.3秒待機してから突進開始
        setTimeout(runNextTargetSequence, 350);
    }

    // グローバル公開
    window.AttackAnimation = {
        play: playAttackCutin
    };

})(window);