/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O indicador do modo dev ficava por cima do botão Editar.
  devIndicators: false,
  // Banco: carregados pelo Node direto, sem passar pelo bundler.
  serverExternalPackages: ['pg', '@electric-sql/pglite'],
};

export default nextConfig;
