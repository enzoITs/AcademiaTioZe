import { notFound } from 'next/navigation';
import { currentAdmin } from '../../server/auth.js';
import AdminPanel from '../../components/admin/AdminPanel.js';

export const metadata = {
  title: 'Painel do administrador · Academia do Tio Zé',
  robots: { index: false, follow: false },
};

/** Só existe para quem está logado numa conta de admin; para os outros, é uma página 404. */
export default async function AdminPage() {
  const admin = await currentAdmin();
  if (!admin) notFound();
  return <AdminPanel adminName={admin.name} />;
}
