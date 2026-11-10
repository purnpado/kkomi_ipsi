package main

import (
	"fmt"
	"strings"

	"PHGC/internal/crypto"
	"PHGC/internal/model"
)

// SavePasswordResetPackage opens a native save dialog for a teacher reset
// package.  It is called immediately after the administrator assigns a new
// initial password.
func (a *App) SavePasswordResetPackage(username string) (string, error) {
	path, err := a.saveFileDialog(
		"담임 비밀번호 재설정 파일 저장",
		fmt.Sprintf("꼬미입시-%s-비밀번호재설정.kkomireset", username),
		"꼬미입시 비밀번호 재설정 파일 (*.kkomireset)",
		"*.kkomireset",
	)
	if err != nil || path == "" {
		return "", err
	}
	if err := a.ExportPasswordResetPackage(username, path); err != nil {
		return "", err
	}
	return path, nil
}

// OpenPasswordResetPackage lets a teacher select the recovery file on the
// login screen without exposing the data directory.
func (a *App) OpenPasswordResetPackage() (string, error) {
	path, err := a.openFileDialog(
		"담임 비밀번호 재설정 파일 선택",
		"꼬미입시 비밀번호 재설정 파일 (*.kkomireset, *.phgcreset)",
		"*.kkomireset;*.phgcreset",
	)
	if err != nil || path == "" {
		return "", err
	}
	return a.ImportPasswordResetPackage(path)
}

// SaveDistributionPackage creates a portable teacher/viewer deployment
// package. It is intentionally separate from password-reset packages.
func (a *App) SaveDistributionPackage(username string) (string, error) {
	if a.user == nil || a.user.Role != "master" {
		return "", fmt.Errorf("교사용 배포 자료 생성은 학년부장 계정만 할 수 있습니다")
	}
	path, err := a.saveFileDialog(
		"교사용 배포 자료 저장",
		fmt.Sprintf("꼬미입시-%s-배포자료.kkomipkg", username),
		"꼬미입시 교사용 배포 자료 (*.kkomipkg)",
		"*.kkomipkg",
	)
	if err != nil || path == "" {
		return "", err
	}
	if err := a.ExportDistributionPackage(username, path); err != nil {
		return "", err
	}
	return path, nil
}

// OpenDistributionPackage imports a deployment package on a fresh copy of the
// program. The recipient still supplies the shared password once on login.
func (a *App) OpenDistributionPackage() (string, error) {
	path, err := a.openFileDialog(
		"교사용 배포 자료 선택",
		"꼬미입시 교사용 배포 자료 (*.kkomipkg, *.phgcpkg)",
		"*.kkomipkg;*.phgcpkg",
	)
	if err != nil || path == "" {
		return "", err
	}
	return a.ImportDistributionPackage(path)
}

// SaveFinalArchive creates a portable AES-256-GCM encrypted archive of every
// encrypted school data file. It contains no plaintext SQLite database.
func (a *App) SaveFinalArchive(archivePassword string) (string, error) {
	if a.user == nil || a.user.Role != "master" || len(a.dataKey) != 32 {
		return "", fmt.Errorf("최종 보관본 생성은 학년부장 로그인 후에만 할 수 있습니다")
	}
	if strings.TrimSpace(archivePassword) == "" {
		return "", fmt.Errorf("보관본 암호를 입력해주세요")
	}
	config, err := a.db.GetSchoolConfig()
	if err != nil {
		return "", err
	}
	path, err := a.saveFileDialog(
		"암호화 최종 보관본 저장",
		fmt.Sprintf("꼬미입시-%s-%d-최종보관본.kkomiarchive", config.SchoolName, config.AdmissionYear),
		"꼬미입시 암호화 보관본 (*.kkomiarchive)",
		"*.kkomiarchive",
	)
	if err != nil || path == "" {
		return "", err
	}
	if err := a.ExportFinalArchive(archivePassword, path); err != nil {
		return "", err
	}
	return path, nil
}

func (a *App) OpenFinalArchive() (string, error) {
	path, err := a.openFileDialog(
		"암호화 최종 보관본 선택",
		"꼬미입시 암호화 보관본 (*.kkomiarchive, *.phgcarchive)",
		"*.kkomiarchive;*.phgcarchive",
	)
	if err != nil || path == "" {
		return "", err
	}
	return path, nil
}

// SaveTeacherPatch opens a native save dialog and writes an encrypted patch.
func (a *App) SaveTeacherPatch(password, username string, classNum int, changes []model.PatchChange) (string, error) {
	classTag := username
	if classNum > 0 && !strings.Contains(username, fmt.Sprintf("%d", classNum)) {
		classTag = fmt.Sprintf("3%02d_%s", classNum, username)
	}
	defaultFilename := fmt.Sprintf("취합자료_%s.kkomipatch", classTag)
	path, err := a.saveFileDialog(
		"취합자료 제출(담임)",
		defaultFilename,
		"꼬미입시 취합자료 (*.kkomipatch)",
		"*.kkomipatch",
	)
	if err != nil || path == "" {
		return "", err
	}
	if err := a.ExportTeacherPatch(password, username, classNum, changes, path); err != nil {
		return "", err
	}
	return path, nil
}

// SaveCurrentClassPatch lets a homeroom teacher export their own class
// snapshot without choosing records manually.
func (a *App) SaveCurrentClassPatch(password string) (string, error) {
	if a.user == nil || a.user.Role != "homeroom" || a.user.ClassNum < 1 {
		return "", fmt.Errorf("담임 계정으로 로그인한 뒤에만 취합자료를 제출할 수 있습니다")
	}
	changes, err := a.db.GetClassPatchChanges(a.user.ClassNum)
	if err != nil {
		return "", err
	}
	if len(changes) == 0 {
		return "", fmt.Errorf("제출할 학생 데이터가 없습니다")
	}
	// 입력된 암호가 학년부장의 공용 데이터 암호와 일치하는지 엄격히 검증
	if _, err := crypto.OpenSharedKeyEnvelope(a.db.DataDir, password); err != nil {
		return "", fmt.Errorf("공용 데이터 암호가 올바르지 않습니다. 학년부장에게 확인 후 정확한 암호를 입력해 주세요")
	}
	return a.SaveTeacherPatch(password, a.user.Username, a.user.ClassNum, changes)
}

// OpenTeacherPatchPreview selects a patch without applying it.
func (a *App) OpenTeacherPatchPreview(password string) (model.PatchPreview, error) {
	// 공용 데이터 암호 사전 검증: 틀린 암호 입력 시 파일 탐색기를 열지 않고 즉시 차단
	if _, err := crypto.OpenSharedKeyEnvelope(a.db.DataDir, password); err != nil {
		return model.PatchPreview{}, fmt.Errorf("공용 데이터 비밀번호가 올바르지 않습니다")
	}
	path, err := a.openFileDialog(
		"취합자료 미리보기(학년부장)",
		"꼬미입시 취합자료 (*.kkomipatch, *.phgcpatch)",
		"*.kkomipatch;*.phgcpatch",
	)
	if err != nil || path == "" {
		return model.PatchPreview{}, err
	}
	return a.InspectTeacherPatch(password, path)
}

// OpenTeacherPatch lets the administrator select and merge one or more patch files.
func (a *App) OpenTeacherPatch(password string) (map[string]int, error) {
	// 공용 데이터 암호 사전 검증: 틀린 암호 입력 시 파일 탐색기를 열지 않고 즉시 차단
	if _, err := crypto.OpenSharedKeyEnvelope(a.db.DataDir, password); err != nil {
		return nil, fmt.Errorf("공용 데이터 비밀번호가 올바르지 않습니다")
	}
	paths, err := a.openMultipleFilesDialog(
		"취합자료 일괄 병합(학년부장) - 여러 파일 동시 선택 가능 (Ctrl 또는 Shift 클릭)",
		"꼬미입시 취합자료 (*.kkomipatch, *.phgcpatch)",
		"*.kkomipatch;*.phgcpatch",
	)
	if err != nil || len(paths) == 0 {
		return nil, err
	}
	totalMerged := 0
	validFileCount := 0
	for _, path := range paths {
		if count, err := a.ImportTeacherPatch(password, path); err == nil {
			totalMerged += count
			validFileCount++
		}
	}
	if validFileCount == 0 {
		return nil, fmt.Errorf("선택된 파일 중 올바른 취합자료가 없거나 암호가 일치하지 않습니다")
	}
	return map[string]int{
		"files":    validFileCount,
		"students": totalMerged,
	}, nil
}
