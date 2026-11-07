// Demonstration data for the home page. Replace with the events API when it exists.
export const sampleEvents = [
  {
    date: 'SAT 14 NOV',
    time: '10:00',
    title: 'Campus Blood Donation Camp',
    club: 'BBA Club',
    departments: 'CSE, ECE, BBA',
    visibility: 'PUBLIC',
  },
  {
    date: 'WED 18 NOV',
    time: '15:30',
    title: 'Inter-Department Code Sprint',
    club: 'CSE Club',
    departments: 'CSE, ECE',
    visibility: 'PUBLIC',
  },
  {
    date: 'FRI 20 NOV',
    time: '17:00',
    title: 'Circuit Design Workshop',
    club: 'ECE Club',
    departments: 'ECE',
    visibility: 'MEMBERS_ONLY',
  },
  {
    date: 'TUE 24 NOV',
    time: '14:00',
    title: 'Startup Pitch Night',
    club: 'BBA Club',
    departments: 'BBA, CSE',
    visibility: 'PUBLIC',
  },
  {
    date: 'WED 02 DEC',
    time: '16:00',
    title: 'Committee Election Briefing',
    club: 'CSE Club',
    departments: 'CSE',
    visibility: 'MEMBERS_ONLY',
  },
] as const;
