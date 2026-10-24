// Matter.jsのモジュール
const { Engine, Render, World, Bodies, Body, Constraint, Events, Mouse, MouseConstraint } = Matter;

// ゲーム設定
const config = {
    width: 800,
    height: 600,
    craneSpeed: 3,
    cableSpeed: 2,
    maxCableLength: 445
};

// ゲーム状態
let gameState = {
    score: 0,
    status: '操作中',
    craneState: 'idle', // idle, descending, grabbing, ascending, returning
    grabbedPrize: null,
    keys: {}
};

// Matter.jsのセットアップ
const engine = Engine.create();
const world = engine.world;
world.gravity.y = 1;

const canvas = document.getElementById('gameCanvas');
const render = Render.create({
    canvas: canvas,
    engine: engine,
    options: {
        width: config.width,
        height: config.height,
        wireframes: false,
        background: '#e8f4f8'
    }
});

// クレーン構造
let crane = {
    base: null,
    cable: null,
    hook: null,
    armLeft: null,
    armRight: null,
    constraint: null,
    grabbedConstraint: null,
    baseY: 50,
    cableLength: 100,
    minCableLength: 100,
    maxCableLength: 445,
    depth: 1.0,  // 奥行き（0.6〜1.4の範囲）
    minDepth: 0.6,
    maxDepth: 1.4,
    armAngle: 1.0,  // アームの開き具合（0=閉じている、1=開いている）
    armOpenAngle: 1.0,
    armClosedAngle: 0.1
};

// 壁と床の作成
function createBoundaries() {
    const thickness = 50;

    // 床
    const floor = Bodies.rectangle(
        config.width / 2,
        config.height - 25,
        config.width,
        50,
        {
            isStatic: true,
            render: { fillStyle: '#8B4513' }
        }
    );

    // 左壁
    const leftWall = Bodies.rectangle(
        25,
        config.height / 2,
        50,
        config.height,
        {
            isStatic: true,
            render: { fillStyle: '#666' }
        }
    );

    // 右壁
    const rightWall = Bodies.rectangle(
        config.width - 25,
        config.height / 2,
        50,
        config.height,
        {
            isStatic: true,
            render: { fillStyle: '#666' }
        }
    );

    // 取得エリアの壁
    const collectionWall = Bodies.rectangle(
        100,
        config.height - 100,
        10,
        150,
        {
            isStatic: true,
            render: { fillStyle: '#FFD700' }
        }
    );

    World.add(world, [floor, leftWall, rightWall, collectionWall]);
}

// クレーンの作成
function createCrane() {
    // クレーンのベース（移動する台座）
    crane.base = Bodies.rectangle(
        config.width / 2,
        crane.baseY,
        60,
        20,
        {
            isStatic: true,
            render: { fillStyle: '#FF6347' }
        }
    );

    // フック中心点（アームの接続点）- 静的にして回転を防ぐ
    crane.hook = Bodies.circle(
        config.width / 2,
        crane.baseY + crane.cableLength,
        8,
        {
            isStatic: true,
            render: { fillStyle: '#FFD700', visible: false }
        }
    );

    // 左アーム（静的にして重力の影響を受けないようにする）
    crane.armLeft = Bodies.rectangle(
        config.width / 2 - 15,
        crane.baseY + crane.cableLength + 25,
        10,
        50,
        {
            isStatic: true,
            render: { fillStyle: '#FFD700', visible: false }
        }
    );

    // 右アーム（静的にして重力の影響を受けないようにする）
    crane.armRight = Bodies.rectangle(
        config.width / 2 + 15,
        crane.baseY + crane.cableLength + 25,
        10,
        50,
        {
            isStatic: true,
            render: { fillStyle: '#FFD700', visible: false }
        }
    );

    // ケーブル（制約として表現）
    crane.constraint = Constraint.create({
        bodyA: crane.base,
        bodyB: crane.hook,
        length: crane.cableLength,
        stiffness: 0.8,
        render: {
            strokeStyle: '#333',
            lineWidth: 3
        }
    });

    World.add(world, [crane.base, crane.hook, crane.armLeft, crane.armRight, crane.constraint]);
}

// クレーンの奥行きに基づいてスケールを更新
function updateCraneScale() {
    // 元のサイズを保存（初回のみ）
    if (!crane.base.originalSize) {
        crane.base.originalSize = { width: 60, height: 20 };
        crane.hook.originalSize = { radius: 15 };
    }

    const scale = crane.depth;

    // 透明度で奥行き感を演出（遠いほど薄く）
    const opacity = 0.5 + (scale - crane.minDepth) / (crane.maxDepth - crane.minDepth) * 0.5;

    // 色の明度を調整
    crane.base.render.opacity = opacity;
    crane.hook.render.opacity = opacity;

    // ケーブルの太さ更新
    crane.constraint.render.lineWidth = 3 * scale;
}

// フックの位置を更新
function updateHookPosition() {
    Body.setPosition(crane.hook, {
        x: crane.base.position.x,
        y: crane.baseY + crane.cableLength
    });
}

// アームの位置を更新
function updateArmPositions() {
    const hookPos = crane.hook.position;
    const armSpacing = 40 * crane.armAngle; // アームの開き具合
    const armLength = 50;

    // 左アーム
    Body.setPosition(crane.armLeft, {
        x: hookPos.x - armSpacing,
        y: hookPos.y + armLength / 2
    });
    Body.setAngle(crane.armLeft, -crane.armAngle * 0.4);

    // 右アーム
    Body.setPosition(crane.armRight, {
        x: hookPos.x + armSpacing,
        y: hookPos.y + armLength / 2
    });
    Body.setAngle(crane.armRight, crane.armAngle * 0.4);
}

// 景品の作成
function createPrizes() {
    const prizes = [];

    // 野菜の定義
    const vegetables = [
        { emoji: '🍅', color: '#FF6347', type: 'circle', size: 25, name: 'トマト' },
        { emoji: '🍆', color: '#8B4789', type: 'ellipse', width: 30, height: 45, name: 'ナス' },
        { emoji: '🥒', color: '#4CAF50', type: 'rectangle', width: 50, height: 30, name: 'キュウリ' },
        { emoji: '🥔', color: '#A0826D', type: 'ellipse', width: 40, height: 30, name: 'ジャガイモ' }
    ];

    // 様々な野菜を作成
    for (let i = 0; i < 12; i++) {
        const x = 200 + (i % 4) * 120 + Math.random() * 40;
        const baseY = config.height - 150 - Math.floor(i / 4) * 80;

        // ランダムに野菜を選択
        const veggie = vegetables[i % vegetables.length];

        // ランダムな奥行きを設定（0.6〜1.4）
        const depth = crane.minDepth + Math.random() * (crane.maxDepth - crane.minDepth);

        // 奥行きに応じてY座標を調整（遠いものは少し上に）
        const depthOffset = (depth - 1.0) * 40;
        const y = baseY + depthOffset;

        let prize;
        if (veggie.type === 'circle') {
            // 円形の野菜（トマト）
            prize = Bodies.circle(x, y, veggie.size, {
                density: 0.001,
                restitution: 0.4,
                friction: 0.8,
                render: { fillStyle: veggie.color }
            });
            prize.circleRadius = veggie.size;
        } else if (veggie.type === 'rectangle') {
            // 長方形の野菜（キュウリ）
            prize = Bodies.rectangle(x, y, veggie.width, veggie.height, {
                density: 0.001,
                restitution: 0.4,
                friction: 0.8,
                render: { fillStyle: veggie.color }
            });
            prize.rectWidth = veggie.width;
            prize.rectHeight = veggie.height;
        } else if (veggie.type === 'ellipse') {
            // 楕円形の野菜（ナス、ジャガイモ）
            prize = Bodies.rectangle(x, y, veggie.width, veggie.height, {
                density: 0.001,
                restitution: 0.4,
                friction: 0.8,
                chamfer: { radius: Math.min(veggie.width, veggie.height) / 2 },
                render: { fillStyle: veggie.color }
            });
            prize.rectWidth = veggie.width;
            prize.rectHeight = veggie.height;
        }

        // 景品に野菜情報を保存
        prize.depth = depth;
        prize.baseColor = veggie.color;
        prize.emoji = veggie.emoji;
        prize.veggieName = veggie.name;
        prize.render.visible = false; // カスタム描画を使用するため非表示

        prizes.push(prize);
    }

    World.add(world, prizes);
}

// キーボード入力
document.addEventListener('keydown', (e) => {
    // 矢印キーとスペースキーのデフォルト動作を防止
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
    }

    gameState.keys[e.key] = true;

    // スペースキーでクレーン下降開始
    if (e.key === ' ' && gameState.craneState === 'idle') {
        gameState.craneState = 'descending';
        gameState.status = 'クレーン下降中';
        updateStatus();
    }
});

document.addEventListener('keyup', (e) => {
    // 矢印キーとスペースキーのデフォルト動作を防止
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
    }

    gameState.keys[e.key] = false;
});

// クレーン制御
function controlCrane() {
    if (gameState.craneState === 'idle') {
        // 奥行きに応じた移動速度
        const depthSpeed = config.craneSpeed * crane.depth;

        // 左右移動
        if (gameState.keys['ArrowLeft'] && crane.base.position.x > 100) {
            Body.setPosition(crane.base, {
                x: crane.base.position.x - depthSpeed,
                y: crane.base.position.y
            });
            updateHookPosition();
            updateArmPositions();
        }
        if (gameState.keys['ArrowRight'] && crane.base.position.x < config.width - 100) {
            Body.setPosition(crane.base, {
                x: crane.base.position.x + depthSpeed,
                y: crane.base.position.y
            });
            updateHookPosition();
            updateArmPositions();
        }

        // 前後移動（奥行き調整）
        if (gameState.keys['ArrowUp'] && crane.depth < crane.maxDepth) {
            crane.depth += 0.01;
            updateCraneScale();
        }
        if (gameState.keys['ArrowDown'] && crane.depth > crane.minDepth) {
            crane.depth -= 0.01;
            updateCraneScale();
        }
    }

    // クレーン下降
    if (gameState.craneState === 'descending') {
        if (crane.cableLength < crane.maxCableLength) {
            crane.cableLength += config.cableSpeed;
            crane.constraint.length = crane.cableLength;
            updateHookPosition();
            updateArmPositions();
        } else {
            gameState.craneState = 'closing';
            gameState.status = 'アームを閉じています...';
            updateStatus();
        }
    }

    // アームを閉じる
    if (gameState.craneState === 'closing') {
        if (crane.armAngle > crane.armClosedAngle) {
            crane.armAngle -= 0.02;
            updateArmPositions();
        } else {
            crane.armAngle = crane.armClosedAngle;
            gameState.craneState = 'grabbing';
            setTimeout(() => {
                checkGrab();
            }, 300);
        }
    }

    // クレーン上昇
    if (gameState.craneState === 'ascending') {
        if (crane.cableLength > crane.minCableLength) {
            crane.cableLength -= config.cableSpeed;
            crane.constraint.length = crane.cableLength;
            updateHookPosition();
            updateArmPositions();
        } else {
            gameState.craneState = 'returning';
            gameState.status = '景品を移動中';
            updateStatus();
        }
    }

    // 取得エリアへ移動
    if (gameState.craneState === 'returning') {
        const targetX = 100;
        const dx = targetX - crane.base.position.x;

        if (Math.abs(dx) > 2) {
            const moveX = dx > 0 ? config.craneSpeed : -config.craneSpeed;
            Body.setPosition(crane.base, {
                x: crane.base.position.x + moveX,
                y: crane.base.position.y
            });
            updateHookPosition();
            updateArmPositions();
        } else {
            // アームを開いて景品を落とす
            gameState.craneState = 'opening';
        }
    }

    // アームを開く
    if (gameState.craneState === 'opening') {
        if (crane.armAngle < crane.armOpenAngle) {
            crane.armAngle += 0.03;
            updateArmPositions();
        } else {
            crane.armAngle = crane.armOpenAngle;

            // 景品を落とす
            if (crane.grabbedConstraint) {
                if (Array.isArray(crane.grabbedConstraint)) {
                    crane.grabbedConstraint.forEach(c => World.remove(world, c));
                } else {
                    World.remove(world, crane.grabbedConstraint);
                }
                crane.grabbedConstraint = null;

                if (gameState.grabbedPrize) {
                    gameState.score++;
                    updateScore();
                    gameState.grabbedPrize = null;
                }
            }

            // 初期位置に戻る
            setTimeout(() => {
                resetCrane();
            }, 1000);
        }
    }
}

// 景品を掴む処理
function checkGrab() {
    const bodies = world.bodies;
    let grabbed = false;

    // フックの位置
    const hookX = crane.hook.position.x;
    const hookY = crane.hook.position.y;

    for (let body of bodies) {
        if (!body.isStatic && body !== crane.hook && body !== crane.armLeft && body !== crane.armRight && body.depth !== undefined) {
            // フックからの距離を計算
            const distanceFromHook = Math.sqrt(
                Math.pow(body.position.x - hookX, 2) +
                Math.pow(body.position.y - hookY, 2)
            );

            // 奥行きの差を計算
            const depthDiff = Math.abs(body.depth - crane.depth);

            // フックの近く（60ピクセル以内）にあり、奥行きも近い場合に掴める
            if (distanceFromHook < 60 && depthDiff < 0.2) {
                // 景品を両アームで掴む
                const leftConstraint = Constraint.create({
                    bodyA: crane.armLeft,
                    bodyB: body,
                    length: Math.sqrt(
                        Math.pow(body.position.x - crane.armLeft.position.x, 2) +
                        Math.pow(body.position.y - crane.armLeft.position.y, 2)
                    ),
                    stiffness: 0.5,
                    render: { visible: false }
                });

                const rightConstraint = Constraint.create({
                    bodyA: crane.armRight,
                    bodyB: body,
                    length: Math.sqrt(
                        Math.pow(body.position.x - crane.armRight.position.x, 2) +
                        Math.pow(body.position.y - crane.armRight.position.y, 2)
                    ),
                    stiffness: 0.5,
                    render: { visible: false }
                });

                World.add(world, [leftConstraint, rightConstraint]);
                crane.grabbedConstraint = [leftConstraint, rightConstraint];
                gameState.grabbedPrize = body;
                grabbed = true;
                gameState.status = '景品を掴みました！';
                updateStatus();
                break;
            }
        }
    }

    if (!grabbed) {
        gameState.status = '失敗...';
        updateStatus();
    }

    // 上昇開始
    gameState.craneState = 'ascending';
}

// クレーンをリセット
function resetCrane() {
    Body.setPosition(crane.base, {
        x: config.width / 2,
        y: crane.baseY
    });

    crane.cableLength = crane.minCableLength;
    crane.constraint.length = crane.cableLength;

    Body.setPosition(crane.hook, {
        x: crane.base.position.x,
        y: crane.baseY + crane.cableLength
    });
    Body.setVelocity(crane.hook, { x: 0, y: 0 });

    // アームを開いた状態に戻す
    crane.armAngle = crane.armOpenAngle;
    updateArmPositions();

    gameState.craneState = 'idle';
    gameState.status = '操作中';
    updateStatus();
}

// UI更新
function updateScore() {
    document.getElementById('score').textContent = gameState.score;
}

function updateStatus() {
    document.getElementById('status').textContent = gameState.status;
}

// ゲームループ
function gameLoop() {
    controlCrane();
}

Events.on(engine, 'beforeUpdate', gameLoop);

// カスタムレンダリングで奥行き効果を追加
Events.on(render, 'afterRender', function() {
    const context = render.context;
    const craneScale = crane.depth;

    // 景品を奥行き順にソートして描画（遠いものから先に）
    const bodies = world.bodies.filter(body => !body.isStatic && body !== crane.hook && body.depth !== undefined);
    bodies.sort((a, b) => a.depth - b.depth);

    bodies.forEach(body => {
        const scale = body.depth;
        const opacity = 0.6 + (scale - crane.minDepth) / (crane.maxDepth - crane.minDepth) * 0.4;

        context.save();
        context.translate(body.position.x, body.position.y);
        context.rotate(body.angle);
        context.scale(scale, scale);
        context.globalAlpha = opacity;

        // 奥行きが近いかどうかで境界線を描画
        const depthDiff = Math.abs(body.depth - crane.depth);
        const isNearDepth = depthDiff < 0.2;

        if (isNearDepth) {
            context.strokeStyle = '#FFD700';
            context.lineWidth = 2 / scale;
        }

        context.fillStyle = body.baseColor;

        // 背景の形状を描画
        if (body.circleRadius) {
            // 円形
            context.beginPath();
            context.arc(0, 0, body.circleRadius, 0, Math.PI * 2);
            context.fill();
            if (isNearDepth) {
                context.strokeStyle = '#FFD700';
                context.lineWidth = 3 / scale;
                context.stroke();
            }
        } else if (body.rectWidth && body.rectHeight) {
            // 長方形または楕円形
            context.beginPath();
            const rx = body.rectWidth / 2;
            const ry = body.rectHeight / 2;
            context.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
            context.fill();
            if (isNearDepth) {
                context.strokeStyle = '#FFD700';
                context.lineWidth = 3 / scale;
                context.stroke();
            }
        }

        // 絵文字を描画
        if (body.emoji) {
            context.font = `${40 / scale}px Arial`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(body.emoji, 0, 0);
        }

        context.restore();
    });

    // ケーブルを描画
    context.save();
    context.strokeStyle = '#333';
    context.lineWidth = 3 * craneScale;
    context.beginPath();
    context.moveTo(crane.base.position.x, crane.base.position.y);
    context.lineTo(crane.hook.position.x, crane.hook.position.y);
    context.stroke();
    context.restore();

    // クレーンベースを描画
    context.save();
    context.translate(crane.base.position.x, crane.base.position.y);
    context.scale(craneScale, craneScale);
    context.fillStyle = '#FF6347';
    context.fillRect(-30, -10, 60, 20);
    context.restore();

    // フック中心点を描画
    context.save();
    context.translate(crane.hook.position.x, crane.hook.position.y);
    context.scale(craneScale, craneScale);
    context.fillStyle = '#FFD700';
    context.beginPath();
    context.arc(0, 0, 8, 0, Math.PI * 2);
    context.fill();
    context.restore();

    // 左アームを描画
    context.save();
    context.translate(crane.armLeft.position.x, crane.armLeft.position.y);
    context.rotate(crane.armLeft.angle);
    context.scale(craneScale, craneScale);
    context.fillStyle = '#FFD700';
    context.fillRect(-5, -25, 10, 50);
    // アーム先端の爪
    context.fillStyle = '#FF8C00';
    context.beginPath();
    context.moveTo(-8, 25);
    context.lineTo(0, 32);
    context.lineTo(8, 25);
    context.closePath();
    context.fill();
    context.restore();

    // 右アームを描画
    context.save();
    context.translate(crane.armRight.position.x, crane.armRight.position.y);
    context.rotate(crane.armRight.angle);
    context.scale(craneScale, craneScale);
    context.fillStyle = '#FFD700';
    context.fillRect(-5, -25, 10, 50);
    // アーム先端の爪
    context.fillStyle = '#FF8C00';
    context.beginPath();
    context.moveTo(-8, 25);
    context.lineTo(0, 32);
    context.lineTo(8, 25);
    context.closePath();
    context.fill();
    context.restore();
});

// 初期化
createBoundaries();
createCrane();
createPrizes();

// 初期スケール設定（元の描画を非表示にしてカスタム描画を使用）
crane.base.render.visible = false;
crane.hook.render.visible = false;
crane.constraint.render.visible = false;

// アームの初期位置を設定
updateArmPositions();

// エンジン起動
Render.run(render);
const runner = Matter.Runner.create();
Matter.Runner.run(runner, engine);
