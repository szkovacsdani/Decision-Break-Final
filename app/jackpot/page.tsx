"use client";

import { useState } from "react";

export default function JackpotPage() {
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: any) {
    e.preventDefault();

    const form = new FormData(e.target);

    const data = {
      name: form.get("name"),
      email: form.get("email"),
      message: form.get("message"),
    };

    console.log(data);

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Jackpot Registered</h1>

          <p className="text-zinc-300">We will contact you soon.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 p-6 rounded-2xl border border-red-700">
        <h1 className="text-3xl font-bold mb-2 text-center">
          Jackpot Card Found
        </h1>

        <p className="text-zinc-400 text-center mb-6">
          Fill out the form to claim your reward.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            name="name"
            placeholder="Your name"
            required
            className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700"
          />

          <input
            name="email"
            type="email"
            placeholder="Your email"
            required
            className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700"
          />

          <textarea
            name="message"
            placeholder="Where did you find the card?"
            className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 h-28"
          />

          <button
            type="submit"
            className="w-full bg-red-700 hover:bg-red-600 transition p-3 rounded-lg font-bold"
          >
            Submit
          </button>
        </form>
      </div>
    </main>
  );
}
