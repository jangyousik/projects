# 여행온 프로젝트 현황

최종 정리: 2026-07-18

## 서비스

- 앱 이름: 여행온
- 웹: https://travel-app-six-opal.vercel.app
- Android 패키지: `com.james.hanoitrip`
- 현재 Android 버전: 1.5 (`versionCode 6`)
- 기술: React, Vite, PWA, Capacitor Android, Supabase PostgreSQL

## 완료된 기능

- 이메일 매직링크 및 Google OAuth 로그인
- Android 시스템 브라우저 로그인과 앱 링크 복귀
- 사용자별 여행 목록
- 메인 화면과 여행 상세 화면 분리
- 여행 생성·수정·삭제
- 일정·장소·경비 CRUD
- 완료 금액 수정과 체크
- 멤버 초대, 편집자·보기 전용 권한
- Excel 일정 양식 다운로드·업로드·내보내기
- 예약 상태·사이트·예약번호·예약 링크
- PWA 및 Android APK
- Supabase Storage 기본 버킷과 RLS

## Supabase 마이그레이션

1. `001_initial_schema.sql`: 기본 테이블, RLS, Storage
2. `002_trip_sharing.sql`: 이메일 사용자 초대 RPC
3. `003_schedule_reservations.sql`: 일정 예약 정보
4. `004_place_google_fields.sql`: Google 장소 ID와 지도 URL
5. `005_security_hardening.sql`: 소유권·멤버·작성자 필드 보안 강화

004까지 서버 적용을 확인했다. 005는 Supabase SQL Editor에서 실행해야 한다.

## 현재 화면 구조

### 메인

- 로그인/프로필
- 사용자가 소유하거나 초대받은 여행 목록
- 새 여행 만들기

### 여행 상세

- 일정 만들기와 관리
- 장소 저장과 지도 열기
- 경비 기록
- Excel 입출력
- 예약 관리
- 멤버 초대와 권한 관리

초대받지 않은 사용자는 해당 여행을 조회할 수 없다. 보안은 UI가 아니라 Supabase RLS와 DB 트리거에서 강제한다.

## 보류

- Google Places 자동완성: API 활성화와 결제 정책 검토 후 진행
- Google Play 정식 배포: 릴리스 서명키와 AAB 필요
- 완전한 오프라인 양방향 동기화

## 다음 작업

1. `005_security_hardening.sql` 적용
2. `supabase/checks/hanoi_owner_audit.sql` 실행
3. 소유자·편집자·보기 전용·비멤버 4가지 권한 테스트
4. 하노이 HTML 일정 48개와 선택 일정 2개를 DB로 이전
5. 실제 Android 기기에서 Google 로그인과 앱 복귀 테스트
6. GitHub CLI 로그인 후 변경 사항 커밋·푸시

## 보안 원칙

- `.env.local`, Google Client Secret, service role key는 GitHub에 올리지 않는다.
- 프런트엔드에는 Supabase publishable key만 사용한다.
- 여행 소유권은 UUID로 고정하고 편집자가 변경할 수 없게 한다.
- 하노이 가족여행의 소유자는 `jys7867@gmail.com`인지 관리자 SQL로 확인한다.
