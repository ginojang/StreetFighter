# 기술 목록 (Move List)

> 켄(Ken)과 류(Ryu)의 전체 기술 정리. 두 캐릭터는 **기술 구성·성능이 100% 동일한 클론**이며,
> 차이는 스프라이트(`Ken.png` / `Ryu.png`)와 하도켄 사운드 리소스뿐이다.
> 근거: `Ryu.js` / `Ken.js`의 상태 목록·`specialMoves` 배열이 완전히 일치 (diff 검증).

- 체력: 200 (`HEALTH_MAX_HIT_POINTS`, `src/constants/battle.js`)
- 데미지·점수·넉백 공통값: `FighterAttackBaseData` (`src/constants/fighter.js`)
- 프레임 수치는 60fps 기준 게임 프레임(f) 단위.

---

## 1. 조작 (Controls)

코드 매핑 기준 (`src/config/controls.js`). **1P = 류(왼쪽), 2P = 켄(오른쪽)** —
`gameState.fighters[0] = Ryu`이고 playerId 0이 왼쪽에서 시작.
(README의 "P1 = 화살표" 기술은 코드와 라벨이 반대로 되어 있다.)

| 구분 | 1P (류, 좌측) | 2P (켄, 우측) | 게임패드 |
|------|------|------|------|
| 이동 | W A S D | ↑ ← ↓ → | 왼쪽 스틱 |
| 약 펀치 | Q | / | ✕ |
| 중 펀치 | E | Right Ctrl | □ |
| 강 펀치 | R | . | L1 |
| 약 킥 | F | Right Shift | ○ |
| 중 킥 | V | ' | △ |
| 강 킥 | G | Enter | R1 |

## 2. 이동 (Movement) — 양캐 공통

`initialVelocity` 기준 (px/s).

| 동작 | 수치 |
|------|------|
| 걷기 전진 | 180 |
| 걷기 후진 | 120 |
| 점프 상승 초속 | -420 (중력 1000) |
| 점프 수평 (전방 / 후방 / 제자리) | 168 / -180 / 0 |
| 앉기 | CROUCH_DOWN → CROUCH → CROUCH_UP |

## 3. 기본기 (Normals) — 양캐 공통, 서서만 발동

발동 가능 상태: `IDLE` / `WALK_FORWARD` / `WALK_BACKWARD` (앉기·공중에서는 기본기 없음).
공격당 히트는 1회 (`attackStruck` 플래그로 중복 히트 방지).

| 기술 | 데미지 | 점수 | 넉백 | 히트박스 폭 | 비고 |
|------|------|------|------|------|------|
| 약 펀치 | 12 | 100 | 12 | 50 | 머리 높이, 발생 빠름 |
| 중 펀치 | 20 | 300 | 16 | 68 | 점수 효율 최고 |
| 강 펀치 | 28 | 100 | 22 | 76 | 리치 최장 펀치 |
| 약 킥 | 12 | 100 | 12 | 66 | 상단 판정 |
| 중 킥 | 20 | 300 | 16 | 80 | **리치 전체 최장** |
| 강 킥 | 28 | 100 | 22 | 62 | 상단 판정 |

- 넉백(슬라이드) 단위: 약 12 / 중 16 / 강 22 (`× FRAME_TIME`, 마찰 600~800)
- 히트박스 좌표는 `Ryu.js` / `Ken.js`의 `frames` 맵 참조.

## 4. 필살기 (Special) — 파동권 (Hadouken) 1종

양캐 공통. **입력: ↓ ↘ → + 펀치 버튼** (약/중/강 3강도).
시퀀스: `DOWN → FORWARD_DOWN → FORWARD → *_PUNCH` (`SpecialMovesControls`).

| 강도 | 데미지 | 탄속 (px/s) | 총 모션 | 발사 후 경직 |
|------|------|------|------|------|
| 약 파동권 | 12 | 150 | 52f | 40f |
| 중 파동권 | 20 | 220 | 64f | 46f |
| 강 파동권 | 28 | 300 | 80f | 60f |

- 발사 위치: 캐릭터 x + 76×방향, y - 57 (`Fireball.js`)
- 발생: 모션 4번째 프레임(`special-4`)에서 1회 발사 (`fireballFired` 플래그)
- 파동권 ↔ 파동권 충돌 시 **상쇄** (`FireballCollisionType.FIREBALL`)
- 히트 판정은 펀치 타입으로 처리 (머리/몸통 피격 구분은 히트 위치 기반)

### 발동 조건 (`validFrom`)

파동권은 아래 상태에서 캔슬 발동 가능:

- 기본: IDLE, IDLE_TURN, WALK_FORWARD, CROUCH(전 과정), CROUCH_TURN
- **펀치 캔슬**: 약/중/강 펀치 모션 중 → 파동권 입력 가능
  (기본기 → 필살기 캔슬 콤보가 성립)

## 5. 피격 상태 (Hurt)

`HURT_HEAD_LIGHT/MEDIUM/HEAVY`, `HURT_BODY_LIGHT/MEDIUM/HEAVY` 6종.
경직 `FighterStruckDelay = 15f` 후 피격 모션.

## 6. 구현되지 않은 것 (차후 후보)

- 가드/블로킹 개념 없음 — 히트 시 무조건 피격 상태
- 잡기 없음
- 앉아 공격·공중(점프) 공격 없음
- 두 번째 필살기(승룡권 계열 등) 없음 — `SPECIAL_1_*`만 존재
- 캐릭터별 차별화 없음 (완전 클론)

---

## 프런트에서 보기

게임 화면 왼쪽 워크스페이스 레일 → **🧾 기술 목록** (`src/workspace/moves.js`).
이 문서와 같은 데이터를 오버레이 패널로 표시한다.
