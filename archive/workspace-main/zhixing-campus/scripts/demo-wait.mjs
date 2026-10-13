const url = `http://localhost:${process.argv[2]}`;
const deadline = Date.now() + 115000;
while (Date.now() < deadline) {
  try {
    const response = await fetch(url);
    if (response.ok) {
      await new Promise(() => {
        setInterval(() => {}, 1000);
      });
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 300));
}
process.exitCode = 1;
