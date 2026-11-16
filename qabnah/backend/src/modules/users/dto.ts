export const userDto = (u: any) => ({
  id: u.id,
  phone: u.phone ?? null,
  email: u.email ?? null,
  fullName: u.full_name,
  locale: u.locale,
  status: u.status,
});
