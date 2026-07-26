# 여행온 프로젝트 현황 및 다음 작업

최종 정리: 2026-07-20

## 서비스 정보

- 앱 이름: 여행온
- 운영 웹: https://travel-app-six-opal.vercel.app
- 프런트엔드: React, Vite, PWA
- 모바일: Capacitor Android
- 서버·DB: Supabase Auth, PostgreSQL, Storage, Edge Functions
- AI: OpenAI Responses API를 Supabase Edge Function에서 호출
- Android 패키지: `com.james.hanoitrip`
- 저장소: `jangyousik/projects`

## 현재 완성도

현재 기능 구현 기준 MVP 완성도는 약 **78%**, 일반 사용자에게 안정적으로 공개할 수 있는 출시 준비도는 약 **63%**로 본다.

| 영역 | 완성도 | 현재 상태 |
| --- | ---: | --- |
| 화면·반응형 UI | 82% | 모바일 중심 화면과 하노이 상세 테마 구현 |
| 로그인·사용자 보안 | 78% | 이메일·Google 로그인, RLS, 소유자·멤버 권한 구현 |
| 여행·일정 관리 | 80% | 여행과 일정 CRUD, 날짜별 탭, 완료 처리 구현 |
| 예산·통화 계산 | 75% | 통화별 예산과 실제 사용액, KRW 환산 총액 구현 |
| Excel 입출력 | 75% | 양식·내보내기·업로드·AI 분석 미리보기 구현 |
| AI 일정 도우미 | 72% | 자연어·음성 입력, 기본값 자동 처리, 사용자별 호출 제한 구현 |
| 지도·장소 검색 | 40% | 지도·Grab 링크는 동작, Google Places API 키 미설정 |
| PWA 웹 배포 | 80% | Vercel 운영 배포와 설치 지원, 캐시 갱신 검증 필요 |
| Android 앱 | 55% | Capacitor 기반 APK 존재, 최신 웹 기능 반영 빌드 필요 |
| 오프라인 동기화 | 35% | 기본 PWA 캐시는 있으나 DB 양방향 오프라인 동기화 미완성 |

## 완료된 핵심 기능

- 이메일 및 Google OAuth 로그인
- 로그인 사용자별 여행 목록과 비회원 데이터 차단
- 하노이 가족여행 소유자를 `jys7867@gmail.com`으로 제한
- 여행 생성·수정·삭제와 D-Day
- 여행 기간에 따른 상태 문구 자동 변경
  - 출발 전: `여행을 준비해요 ✈️`
  - 여행 중: `즐거운 여행 중이에요 🌏`
  - 종료 후: `여행을 추억해요 📸`
- 날짜별 일정 탭과 타임라인
- 일정 추가·수정·삭제·완료 및 실제 사용금액 입력
- 일정 입력창의 취소 버튼과 화면 내부 스크롤
- 자연어 AI 일정 도우미와 음성 입력
- AI 분석 상태·API 오류 안내
- 지도 검색 링크, Google Lens, Grab 실행
- 실시간 날씨와 환율
- 환전 계산기 입력·결과 천 단위 쉼표
- 비용 분류: 항공, 숙소, 식비, 교통, 관광·체험, 쇼핑, 기타
- 결제 분류: 현금, 카드, 현금·카드, 예약·선결제
- 총 사용금액을 실시간 환율로 원화 환산
- 호텔·현금·카드·항공 요약과 여러 통화 줄바꿈 표시
- 예약 상태·예약 사이트·예약번호·예약 링크 표시
- 여행 공유와 편집자·보기 전용 권한
- 사용자 이메일 초대와 공유 권한 실제 테스트 완료
- Excel 양식 다운로드·현재 일정 내보내기·업로드 미리보기
- PWA 설치 및 Vercel 운영 배포

## 2026-07-19 작업 내용

- 하노이 일정 날짜를 9일~12일에서 10일~13일로 보정
- 숙소로 잘못 분류된 교통·식비·스파 항목 수정
- 실제 숙소 두 건만 유지
  - A89 웨스트레이크 호텔 체크인: 86,047 KRW
  - Oakwood Residence Hanoi: 679,622 KRW
  - 숙소 합계: 765,669 KRW
- 원화로 잘못 저장된 현지 교통비를 VND로 복원
  - A89 → 미딩: 110,000 VND
  - 미딩 → Oakwood: 80,000 VND
  - Oakwood → 노이바이 공항: 290,000 VND
- 요약바 금액 말줄임표 제거 및 자동 줄바꿈
- 여행 상세 화면의 중복 제목 제거
- AI·마이크 영역이 화면 위로 밀리던 모바일 모달 문제 수정
- 일정 입력창 하단에 `취소`와 `일정 저장` 버튼 추가
- Supabase `analyze-schedule-draft` 함수를 JWT 보호 상태로 재배포
- 최신 웹 버전을 Vercel 운영 주소에 배포

## 2026-07-20 작업 내용

- 후쿠오카 등 여행별 기본 통화에 맞춰 실시간 환율 도구를 공통화
  - 후쿠오카: JPY 환율과 JPY → KRW 계산기
  - 하노이: VND 환율과 VND → KRW 계산기
- 상단 도구를 날씨·Google 렌즈·Google 번역 3칸으로 변경
- 날씨 카드 크기와 내부 여백 축소
- Android Google 번역 앱 직접 실행 기능 추가
- Android 마이크 권한 `RECORD_AUDIO` 추가
- 음성 입력 전 마이크 권한을 요청하고 오류 원인별 안내 표시
- Capacitor 안전영역 변수를 사용해 하단 메뉴와 시스템바 겹침 방지
- AI 일정 입력 필수값 최소화
  - 일정 이름만 필수
  - 날짜는 현재 선택일
  - 비용 0, 분류 기타, 결제 현금·카드 모두, 여행 기본 통화, 예약 없음
  - 기본값 항목은 확인 경고에서 제외
- AI 비용 보호 기능 구현 및 Supabase 적용
  - 일반 사용자 하루 5회
  - 여행 소유자 하루 20회
  - 앱 전체 하루 100회
  - 호출 간 10초 제한
  - AI 처리 후 남은 횟수 표시
- `013_ai_usage_limits.sql`을 Supabase SQL Editor에서 실행 완료
- Supabase Edge Function 재배포 완료
  - `analyze-schedule-draft`
  - `analyze-trip-excel`
- 최신 웹 버전을 Vercel 운영 주소에 배포
- Excel 다운로드·내보내기·업로드 실제 동작 확인
- 여행 상세 일정 제목 옆에 접이식 `Excel 관리` 버튼 추가
  - 이 마지막 Excel 버튼 수정은 로컬 빌드까지 완료됐으며 아직 Vercel에 재배포하지 않음

## Supabase 파일

저장소에는 `001`부터 `012`까지 SQL 파일이 있다. 일부는 Supabase CLI migration이 아니라 SQL Editor에서 수동 실행했으므로, 파일 존재 여부와 실제 서버 적용 여부를 동일하게 간주하면 안 된다.

- `001_initial_schema.sql`: 기본 테이블, RLS, Storage
- `002_trip_sharing.sql`: 이메일 기반 공유 RPC
- `003_schedule_reservations.sql`: 예약 정보
- `004_place_google_fields.sql`: Google 장소 필드
- `005_security_hardening.sql`: 소유권과 하위 데이터 보안
- `006_schedule_cost_classification.sql`: 비용·결제·통화 분류
- `007_fix_trip_sharing_ambiguity.sql`: 공유 RPC 모호성 수정
- `008_expand_trip_currencies.sql`: 지원 통화 확장
- `009_fix_child_identity_trigger.sql`: 작성자 보호 트리거 수정
- `010_fix_hanoi_schedule_dates.sql`: 하노이 일정 날짜 보정
- `011_fix_hanoi_cost_categories.sql`: 하노이 비용 분류 보정
- `012_fix_hanoi_local_cost_currencies.sql`: 현지 교통비 VND 복원
- `013_ai_usage_limits.sql`: 사용자별·전체 AI 일일 한도와 연속 호출 제한

## 다음 작업에서 가장 먼저 할 일

### 1. 마지막 웹 변경 배포

- 일정 제목 옆 `Excel 관리` 버튼이 포함된 최신 빌드를 Vercel에 배포
- PWA 캐시 갱신 후 버튼의 펼치기·접기 확인

### 2. 휴대폰 회귀 테스트

운영 주소에서 아래 순서로 한 번씩 테스트한다.

1. 로그아웃 상태에서 하노이 여행이 보이지 않는지 확인
2. `jys7867@gmail.com` 로그인 후 하노이 여행과 10~13일 일정 확인
3. 숙소 합계가 `₩765,669`인지 확인
4. 현금·카드 현지 비용에 불필요한 KRW가 남지 않았는지 확인
5. 일정 추가 창이 AI 도우미부터 열리는지 확인
6. `취소`가 저장 없이 창을 닫는지 확인
7. 일정 저장·수정·삭제·완료·실제 금액 입력 확인
8. 지도·Grab·Google Lens·Google 번역 버튼 확인
9. 후쿠오카 여행에서 JPY 환율과 계산기 확인
10. AI 사용 후 남은 횟수 표시와 10초 제한 확인
11. 하단 메뉴가 안드로이드 시스템 영역과 겹치지 않는지 확인

### 3. 최신 Android APK 생성

- 최신 웹 빌드를 Capacitor Android에 동기화
- 마이크 권한과 Google 번역 네이티브 플러그인 포함
- APK를 생성해 실기기에 재설치
- 기존 설치본과 버전 차이 및 앱 아이콘 확인

### 4. GitHub 정리

- 현재 변경 파일과 `013` 마이그레이션 검토
- `.env.local`, OpenAI 키, Supabase 비밀키가 포함되지 않았는지 검사
- 작업 내용을 커밋하고 원격 저장소에 푸시

### 5. AI 일정 도우미 실제 테스트

- 자연어 예시: `9월 11일 오전 10시 롯데몰 방문, 점심 50만 동 카드 결제 예정`
- 일정 이름, 날짜, 시간, 장소, 비용, 통화, 분류가 자동 입력되는지 확인
- 휴대폰 마이크 권한과 음성 입력 확인
- 실패하면 AI 입력창 바로 아래의 오류 문구를 기록
- OpenAI API 사용 한도와 프로젝트 결제 상태 확인

### 6. Google 장소 검색 결정

- Google Maps JavaScript API와 Places API(New) 사용 여부 결정
- 사용할 경우 결제 계정과 도메인 제한을 설정한 브라우저 API 키 발급
- 허용 주소:
  - `https://travel-app-six-opal.vercel.app/*`
  - `http://localhost:5173/*`
- 키를 Vercel 환경변수 `VITE_GOOGLE_MAPS_API_KEY`로 설정
- 장소 자동완성, 주소, 위도·경도 저장 테스트

### 7. 날짜 없는 여행 아이디어 보관함

- 여행 상세에 `가고 싶은 곳 · 여행 메모` 영역을 항상 표시
- 날짜를 정하지 않고 장소 또는 자유 메모 저장
- 장소 이름, 주소, 지도 링크, 방문 이유와 간단한 메모 지원
- 아직 일정이 아닌 항목은 날짜별 일정과 분리해 보관
- 저장한 항목에 `일정으로 추가` 버튼 제공
- 일정으로 옮길 때만 날짜·시간·비용을 선택
- 일정으로 옮긴 뒤에도 원본을 남길지 삭제할지 선택
- 추후 Google Places 자동검색과 연결

## 그다음 우선순위

1. 날짜 없는 `가고 싶은 곳 · 여행 메모` 보관함
2. 최신 코드로 Android APK/AAB 다시 빌드
3. PWA 새 버전 알림과 캐시 갱신 UX 개선
4. 영수증 사진 OCR과 경비 자동 입력 완성
5. 사진·QR·예약문서 Storage 화면 연결
6. 오프라인 일정 조회와 재연결 동기화
7. ExcelJS 지연 로딩으로 초기 번들 크기 축소
8. 사용자 친화적인 오류 메시지와 로딩 상태 통일
9. 자동 테스트 추가

## 현재 알려진 제한

- Google Places 자동검색은 API 키가 없어 비활성 상태다.
- AI 일정 도우미와 비용 제한은 서버 배포됐지만 실제 휴대폰 성공 흐름을 다시 확인해야 한다.
- 현재 웹 배포와 Android 설치본의 기능 버전이 다를 수 있다.
- 접이식 `Excel 관리` 버튼은 로컬에만 있으며 다음 웹 배포에 포함해야 한다.
- PWA 캐시 때문에 배포 직후 이전 화면이 잠시 보일 수 있다.
- ExcelJS 번들이 커서 첫 로딩 성능 개선이 필요하다.
- 완전한 오프라인 DB 작성·동기화는 아직 지원하지 않는다.

## 보안 원칙

- OpenAI API 키, Google Client Secret, Supabase service role key를 프런트엔드나 GitHub에 올리지 않는다.
- 프런트엔드에는 Supabase publishable key만 사용한다.
- AI 호출은 Supabase Edge Function에서 수행하고 로그인 JWT 검증을 유지한다.
- 여행 데이터 접근은 화면 숨김이 아니라 Supabase RLS로 강제한다.
- Vercel·Supabase·GitHub 외부 업로드는 대상과 범위를 확인한 뒤 승인받아 진행한다.

## 다음 시작 문장

다음 작업을 시작할 때 다음처럼 요청하면 된다.

> 여행온 프로젝트 상태 문서를 확인하고, Excel 관리 버튼을 포함한 최신 웹 배포부터 진행하자.

## 2026-07-26 통합 개발 (1~9단계)

### 구현 완료

- Android 개인 AI 직접 호출
  - OpenAI Responses API 및 Gemini API 지원
  - 키는 Android Keystore 암호화 저장, JavaScript·Supabase·Vercel로 전달하지 않음
  - 여행온 기본 AI / 개인 AI 선택과 연결 확인 버튼
- 여행 사진 촬영일·연결 일정·장소·메모 저장 및 갤러리 표시
- 영수증 OCR 금액 후보와 인식 원문 확인 후 실제 금액 저장
- 게시판 글쓰기·검색·삭제·신고·작성자 차단
- 관리자 신고 검토·게시글 숨김 구조
- 여행 체크리스트와 예약 문서 비공개 Storage 보관함
- 일정 `.ics` 캘린더 등록 및 30분 전 알림
- 다크모드, 날씨·환율 런타임 캐시, ExcelJS 지연 로딩
- 최신 Android 디버그 APK 빌드 성공
  - `android/app/build/outputs/apk/debug/app-debug.apk`

### 새 마이그레이션

- `014_photo_metadata.sql`
- `015_receipt_metadata.sql`
- `016_community_board.sql`
- `017_trip_checklists.sql`

### 검증 결과

- `npm run build`: 성공
- `npm run lint`: 성공
- Android `assembleDebug`: 성공
- APK 크기: 약 250MB(디버그 빌드)

### 배포 전 남은 필수 작업

Windows 애플리케이션 제어 정책이 다운로드된 Supabase CLI를 차단해 `014`~`017`을 원격 DB에 자동 적용하지 못했다. SQL Editor에서 네 파일을 번호 순서대로 실행한 뒤에만 공개 배포해야 한다. 새 컬럼이 없는 상태에서 새 프런트엔드를 먼저 배포하면 여행 상세 조회가 실패할 수 있다.

GitHub CLI 인증 토큰도 만료되어 원격 푸시가 보류됐다. `gh auth login -h github.com` 재인증 후 커밋·푸시한다.
