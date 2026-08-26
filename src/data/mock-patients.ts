export interface MockPatient {
  id: string;
  name: string;
  preferredName: string;
  age: number;
  gender: "Male" | "Female";
  kind: "New" | "Returning";
}

export const mockPatients: MockPatient[] = [
  {
    id: "pat-ahmed",
    name: "Ahmed Salim Al Balushi",
    preferredName: "Ahmed",
    age: 41,
    gender: "Male",
    kind: "Returning",
  },
  {
    id: "pat-fatima",
    name: "Fatima Nasser Al Harthy",
    preferredName: "Fatima",
    age: 29,
    gender: "Female",
    kind: "New",
  },
  {
    id: "pat-maryam",
    name: "Maryam Rashid Harib Al Farsi",
    preferredName: "Maryam",
    age: 34,
    gender: "Female",
    kind: "Returning",
  },
];
