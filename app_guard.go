package main

import "fmt"

// 백엔드 권한 확인(AGENTS.md 원칙 4: 진로부장은 조회 전용, 담임은 본인 학급만 수정).
// 화면에서 버튼을 감추는 것과 별개로, 자료를 바꾸는 App 메서드는 여기 함수로 역할을 다시 확인한다.

// requireLogin 로그인한 사용자가 있어야 한다.
func (a *App) requireLogin() error {
	if a.user == nil {
		return fmt.Errorf("로그인이 필요합니다")
	}
	return nil
}

// requireMaster 학년부장만 할 수 있는 작업이다. action 은 오류 문장에 들어갈 작업 이름.
func (a *App) requireMaster(action string) error {
	if err := a.requireLogin(); err != nil {
		return err
	}
	if a.user.Role != "master" {
		return fmt.Errorf("%s은(는) 학년부장 계정만 할 수 있습니다", action)
	}
	return nil
}

// requireSelfOrMaster 본인 계정이거나 학년부장이어야 한다(비밀번호 바꾸기 등).
func (a *App) requireSelfOrMaster(username, action string) error {
	if err := a.requireLogin(); err != nil {
		return err
	}
	if a.user.Role == "master" || a.user.Username == username {
		return nil
	}
	return fmt.Errorf("%s은(는) 본인 계정이나 학년부장만 할 수 있습니다", action)
}

// requireHomeroomOf 담임 본인 학급이어야 한다(취합자료 만들기).
func (a *App) requireHomeroomOf(classNum int, action string) error {
	if err := a.requireLogin(); err != nil {
		return err
	}
	if a.user.Role != "homeroom" || a.user.ClassNum < 1 || a.user.ClassNum != classNum {
		return fmt.Errorf("%s은(는) 해당 학급 담임 계정만 할 수 있습니다", action)
	}
	return nil
}
