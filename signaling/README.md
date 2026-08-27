# Netplay Signaling Server

WebRTC 피어 두 명이 **연결을 맺기 위한 최초 악수**(SDP offer/answer + ICE 후보)만
중계하는 초경량 서버입니다. 게임 상태·실시간 입력은 이 서버를 거치지 않고, 협상이
끝나면 브라우저끼리 **P2P DataChannel(UDP형)** 로 직접 주고받습니다.

- **제로 의존성**: Node 내장 모듈만 사용 (WebSocket을 직접 최소 구현). `npm install` 불필요.
- **무상태·무비밀**: 방(room) 이름으로 두 소켓을 잇고 메시지를 그대로 전달할 뿐, 어떤
  게임 데이터나 사용자 정보도 저장하지 않습니다.

## 실행

```bash
node signaling/server.js            # 기본 포트 8080
PORT=9000 node signaling/server.js  # 포트 변경
```

접속 URL 형식:

```
ws://<호스트>:<포트>/?room=<방이름>&role=host|guest
```

## 게임에서 사용

브라우저에서 URL 파라미터로 전송을 WebRTC로 지정합니다(같은 `room`, 같은 `signal`):

```
호스트  ?net=host&transport=webrtc&signal=ws://<호스트>:8080&room=myroom
게스트  ?net=guest&transport=webrtc&signal=ws://<호스트>:8080&room=myroom
```

`?signal=` 을 주지 않으면 기본 전송은 BroadcastChannel(같은 PC 두 탭)이라 서버가 필요
없습니다. 로컬에서 먼저 `?net=host` / `?net=guest` 두 탭으로 검증한 뒤 WebRTC로 넘어가세요.

## NAT/방화벽 (STUN / TURN)

- 기본 STUN: 공개 `stun:stun.l.google.com:19302` (대부분의 가정용 NAT는 이걸로 뚫립니다).
- 커스텀 STUN: `&stun=stun:your.stun:3478`
- 대칭형 NAT 등으로 직결이 안 되면 **TURN 중계**가 필요합니다:

  ```
  &turn=turn:your.turn:3478&turnuser=USER&turncred=SECRET
  ```

> ⚠️ **TURN 자격증명(USER/SECRET)은 런타임 URL 값일 뿐이며, 절대 이 저장소에
> 커밋하지 마세요.** 마찬가지로 배포 서버의 IP·도메인·경로도 코드/문서에 남기지 않습니다.

## 배포 메모 (원격 플레이)

- 브라우저가 `https`로 게임을 열면 시그널링도 `wss://`(TLS)여야 합니다 → 리버스 프록시로
  TLS 종단 후 이 서버(평문 ws)로 포워딩하는 구성이 일반적입니다. 프록시 종단·인증서·호스트
  정보는 이 저장소가 아니라 배포 환경에서만 관리하세요.
