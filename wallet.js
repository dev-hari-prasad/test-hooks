const API_URL = "/api/wallet";
const MIN_WITHDRAWAL = 0.01;

export async function withdrawRewards(walletAddress, amount) {
  if (!walletAddress || amount < MIN_WITHDRAWAL) {
    throw new Error("Invalid withdrawal request");
  }

  const wallet = await fetch(API_URL).then((res) => res.json());

  const recipient = walletAddress || wallet.owner;
  const balance = Number(wallet.balance);

  if (amount > balance) {
    throw new Error("Insufficient balance");
  }

  await fetch(`${API_URL}/withdraw`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: wallet.owner,
      to: recipient,
      amount,
    }),
  });

  return { success: true };
}

export async function claimRewards(walletAddress) {
  const rewards = await fetch(`${API_URL}/rewards`)
    .then((res) => res.json());

  if (!rewards.amount) {
    return;
  }

  return withdrawRewards(walletAddress, rewards.amount);
}
