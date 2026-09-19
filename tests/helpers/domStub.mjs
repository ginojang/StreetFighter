/**
 * node 테스트용 DOM 스톱 — 게임 모듈 import 전에 설치한다.
 *
 * 게임 코드는 "import는 node 안전, DOM 참조는 생성자/호출 시점" 규약으로 작성돼
 * 있지만, utils/context.js → state/renderSettings.js 사슬이 모듈 로드 시
 * location/localStorage를 참조하므로 그것까지 포함해 스톱한다.
 * (정적 import는 끌어올려지므로, 반드시 "설치 후 동적 import" 패턴으로 사용할 것)
 */

const fakeAudio = () => ({
	paused: true,
	currentTime: 0,
	ended: false,
	readyState: 4,
	HAVE_CURRENT_DATA: 2,
	volume: 1,
	play() {
		this.paused = false;
		return Promise.resolve();
	},
	pause() {
		this.paused = true;
	},
});

const fakeCanvas = () => {
	const canvas = {
		width: 0,
		height: 0,
		classList: { toggle() {} },
		getContext: () => ({
			imageSmoothingEnabled: false,
			setTransform() {},
		}),
	};
	return canvas;
};

export const installDomStubs = () => {
	globalThis.document ??= {
		getElementById: () => fakeAudio(),
		querySelector: () => fakeCanvas(),
	};
	globalThis.Image ??= class {};
	globalThis.navigator ??= { getGamepads: () => [] };
	globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
	// state/renderSettings.js가 모듈 로드 시 참조
	globalThis.location ??= { search: '', origin: 'http://localhost', pathname: '/' };
	globalThis.localStorage ??= { getItem: () => null, setItem() {} };
};
