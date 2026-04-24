declare module "node-notifier" {
  const notify: (options: { title: string; message: string }) => void;
  export default notify;
}
