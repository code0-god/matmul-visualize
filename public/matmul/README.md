# Matmul Demo

Rust 기반 타임라인 생성기와 Three.js 전용 뷰어로 구성된 행렬 곱셈 미니 데모입니다.

## JSON 생성

```bash
cargo run -p rust-tracer --release -- \
  --out public/matmul/sample.json \
  --schedule ikj \
  --dims 128,128,128 \
  --tile 16,16,16
```

옵션을 변경하면 타일 크기, 루프 순서, 출력 경로 등을 자유롭게 조절할 수 있습니다. 기본값은 위 명령과 동일하며, `sample.json`은 `public/matmul/` 아래에 생성됩니다.

## 프런트엔드 실행

1. 루트 디렉터리에서 간단한 정적 서버를 실행합니다.
   ```bash
   python -m http.server 8000
   ```
2. 브라우저에서 `http://localhost:8000/public/matmul/` 에 접속합니다.
3. 오른쪽 패널에서 재생/일시정지 및 속도 조절을 할 수 있으며, 좌측 3D 캔버스에서 A/B/C 타일이 타임라인에 따라 갱신됩니다.

기존 MNIST 시각화와는 독립적으로 동작하므로 두 데모를 동시에 유지할 수 있습니다.
