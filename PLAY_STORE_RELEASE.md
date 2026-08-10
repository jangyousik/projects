# 여행온 Google Play 출시 준비

업데이트: 2026-07-26

## 확정된 Android 정보

- 앱 이름: 여행온
- 패키지 ID: `com.jys7867.travelon`
- 버전 코드: `9`
- 버전 이름: `1.8.0`
- 대상 SDK: 36
- 배포 형식: Android App Bundle (`.aab`)

패키지 ID는 Play에 최초 등록한 뒤 바꾸지 않는다.

## Supabase에서 먼저 실행할 SQL

`supabase/migrations/019_account_deletion.sql`을 SQL Editor에서 실행한다. 실행 전에는 앱의 회원 탈퇴 버튼이 동작하지 않는다.

## 공개 정책 URL

- 개인정보 처리방침: `https://travel-app-six-opal.vercel.app/privacy.html`
- 계정 삭제 안내: `https://travel-app-six-opal.vercel.app/account-deletion.html`
- 이용약관/커뮤니티 정책: `https://travel-app-six-opal.vercel.app/terms.html`

## 업로드 키 생성

키스토어와 비밀번호는 GitHub에 올리지 않는다. 프로젝트 루트에서 아래 도우미를 한 번만 실행한다. 비밀번호는 화면에 표시되지 않는다.

```powershell
.\scripts\create-play-upload-key.ps1
```

생성된 `android/travelon-upload.jks`와 비밀번호는 서로 다른 안전한 장소 두 곳에 백업한다. 도우미는 기존 키가 있으면 덮어쓰지 않는다.

## AAB 만들기

```powershell
npm run build
npx cap sync android
Set-Location android
.\gradlew.bat bundleRelease
```

결과 파일: `android/app/build/outputs/bundle/release/app-release.aab`

## Play Console 입력 순서

1. 앱 만들기 → 앱 이름 `여행온`, 기본 언어 `한국어`
2. 앱 액세스에서 심사용 테스트 계정과 로그인 방법 제공
3. 광고 포함 여부 선택(현재 광고 SDK 없음)
4. 콘텐츠 등급 설문
5. 대상 연령: 현재 정책상 만 13세 이상 권장
6. 데이터 보안 양식 작성
7. 개인정보 처리방침 URL 등록
8. 계정 삭제 URL 등록
9. 비공개 테스트 트랙에 AAB 업로드
10. 신규 개인 계정이면 12명 이상이 14일 연속 참여
11. 프로덕션 액세스 신청 후 정식 출시

## Google 로그인 확인

Play App Signing을 켠 뒤 Play Console의 **앱 서명 키 SHA-1**을 확인한다. Android용 Google OAuth 클라이언트를 별도로 사용하는 경우 패키지 ID `com.jys7867.travelon`과 해당 SHA-1을 Google Cloud Console에 등록한다. 현재 Supabase 웹 OAuth 흐름도 실제 Play 설치본에서 다시 테스트한다.
