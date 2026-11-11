package sync

import "testing"

func TestPickDownloadAssetPrefersKkomiNames(t *testing.T) {
	cases := []struct {
		name   string
		assets []ReleaseAsset
		want   string
	}{
		{"Gitea 한글 실행 파일", []ReleaseAsset{{"kkomi-ipsi_v1.6.4.zip", "zip"}, {"꼬미입시.exe", "ko"}}, "ko"},
		{"GitHub 영문 실행 파일", []ReleaseAsset{{"kkomi-ipsi_v1.6.4.zip", "zip"}, {"kkomi-ipsi.exe", "en"}}, "en"},
		{"이전 릴리즈 PHGC.exe", []ReleaseAsset{{"phgc_v1.6.3.zip", "zip"}, {"PHGC.exe", "old"}}, "old"},
		{"한글 우선", []ReleaseAsset{{"PHGC.exe", "old"}, {"kkomi-ipsi.exe", "en"}, {"꼬미입시.exe", "ko"}}, "ko"},
		{"그 밖의 exe", []ReleaseAsset{{"readme.txt", "txt"}, {"other.exe", "other"}}, "other"},
		{"실행 파일 없음", []ReleaseAsset{{"notes.zip", "zip"}}, ""},
	}
	for _, c := range cases {
		if got := PickDownloadAsset(c.assets); got != c.want {
			t.Errorf("%s: %q, 기대값 %q", c.name, got, c.want)
		}
	}
}
