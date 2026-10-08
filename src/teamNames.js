// 화면 표기만 바꾸고 Firebase 컬렉션·설정에 쓰는 내부 팀 ID는 그대로 유지한다.
export const displayTeamName = (team) => typeof team === 'string' ? team.replace(/^Software팀/, 'S/W팀') : team;
