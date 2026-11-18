// Vite `?raw` imports return the file text as a string.
declare module '*?raw' {
  const text: string;
  export default text;
}
