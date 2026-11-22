(() => {
  "use strict";

  const passages = {
    hamlet: {
      source: "William Shakespeare · Hamlet, Act III, scene i · lecture excerpt",
      text: "ENTER HAMLET HAM TO BE OR NOT TO BE THAT IS THE QUESTION WHETHER TIS NOBLER IN THE MIND TO SUFFER THE SLINGS AND ARROWS OF OUTRAGEOUS FORTUNE OR TO TAKE ARMS AGAINST A SEA OF TROUBLES AND BY OPPOSING END THEM"
    },
    austen: {
      source: "Jane Austen · Pride and Prejudice, chapter I",
      text: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife."
    },
    dickens: {
      source: "Charles Dickens · A Tale of Two Cities, book I, chapter I",
      text: "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair…"
    },
    lincoln: {
      source: "Abraham Lincoln · Gettysburg Address, Bliss copy",
      text: "…and that government of the people, by the people, for the people, shall not perish from the earth."
    }
  };

  // The lecture passage uses 21 plaintext letters. Assign the unused cipher
  // letters in alphabetical order to complete a key for the scrambler.
  const lectureKey = "KNDVZCPEIGJHXTBSFYWRALMQOU";
  window.CipherExamples = { passages, lectureKey };
})();
