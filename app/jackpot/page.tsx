"use client";

import { useState } from "react";

export default function JackpotPage() {
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: any) {
    e.preventDefault();

    const form = new FormData(e.target);

    const data = {
      name: form.get("name"),
      code: form.get("code"),
      email: form.get("email"),
      message: form.get("message"),
    };

    const subject = encodeURIComponent("Decision Break Jackpot Card Found");

    const body = encodeURIComponent(
      `A Jackpot Card has been found.

Name: ${data.name}

Jackpot Card Code: ${data.code}

Email: ${data.email}

Where the card was found:
${data.message}`
    );

    window.location.href = `mailto:decisionbreak.jackpot@gmail.com?subject=${subject}&body=${body}`;

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-red-600">
            Jackpot Registered
          </h1>

          <p className="text-zinc-300">
            Your email app should now open to send the message.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 p-6 rounded-2xl border border-red-700 shadow-2xl">
        <h1 className="text-3xl font-bold mb-2 text-center text-red-600">
          Jackpot Card Found
        </h1>

        <p className="text-zinc-400 text-center mb-6">
          Fill out the form below to report the card.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            name="name"
            placeholder="Your name"
            required
            className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 outline-none focus:border-red-600"
          />

          <input
            name="code"
            placeholder="Enter your Jackpot Card code"
            required
            className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 outline-none focus:border-red-600"
          />

          <input
            name="email"
            type="email"
            placeholder="Your email"
            required
            className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 outline-none focus:border-red-600"
          />

          <textarea
            name="message"
            placeholder="Where did you find the card?"
            className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 h-28 outline-none focus:border-red-600"
          />

          <button
            type="submit"
            className="w-full bg-red-700 hover:bg-red-600 transition p-3 rounded-lg font-bold"
          >
            Submit Jackpot
          </button>
        </form>
      </div>
    </main>
  );
}
