import streamlit as st
import numpy as np
import matplotlib.pyplot as plt
from scipy.stats import norm

# --- HELPER FUNCTIONS ---
def calculate_ci(p_hat, n, confidence=0.95):
    z_score = norm.ppf(1 - (1 - confidence) / 2)
    margin_of_error = z_score * np.sqrt((p_hat * (1 - p_hat)) / n)
    return max(0, p_hat - margin_of_error), min(1, p_hat + margin_of_error)

def generate_data():
    st.session_state.true_p = round(np.random.uniform(0.2, 0.8), 2)
    st.session_state.n = 50
    st.session_state.intervals = []
    st.session_state.p_hats = []
    
    for _ in range(100):
        # Generate a sample and calculate p_hat
        sample = np.random.binomial(1, st.session_state.true_p, st.session_state.n)
        p_hat = sample.mean()
        lower, upper = calculate_ci(p_hat, st.session_state.n)
        
        st.session_state.intervals.append((lower, upper))
        st.session_state.p_hats.append(p_hat)
        
    # Pick a random interval for the game
    st.session_state.picked_idx = np.random.randint(0, 100)
    
    # Find an interval that MISSED for the final lesson
    missed_indices = [i for i, (l, u) in enumerate(st.session_state.intervals) 
                      if st.session_state.true_p < l or st.session_state.true_p > u]
    st.session_state.missed_idx = missed_indices[0] if missed_indices else None

# --- STATE MANAGEMENT ---
if 'step' not in st.session_state:
    st.session_state.step = 0
    generate_data()

# --- APP LAYOUT ---
st.title("The Confidence Interval Detective")

# STEP 0: Introduction
if st.session_state.step == 0:
    st.write("I have secretly selected a true population proportion (p) between 0.2 and 0.8.")
    st.write("I just took 100 random samples of size n=50 and created 100 confidence intervals.")
    if st.button("Pick a random interval to investigate"):
        st.session_state.step = 1
        st.rerun()

# STEP 1: The Question
if st.session_state.step >= 1:
    l, u = st.session_state.intervals[st.session_state.picked_idx]
    st.subheader(f"Your Random Interval: [{l:.2f}, {u:.2f}]")
    
    if st.session_state.step == 1:
        st.write(f"Imagine a researcher claims the true value is **{st.session_state.true_p}**.")
        answer = st.radio("Based on your interval, what can you conclude about this claim?", 
                          ["Select an option...",
                           f"Plausible: {st.session_state.true_p} is inside the interval, but we cannot say p is exactly {st.session_state.true_p}.",
                           f"Ruled out: {st.session_state.true_p} is not in the interval.",
                           f"Proven: p is exactly {st.session_state.true_p}."])
        
        if answer != "Select an option...":
            if st.button("Submit Answer & Reveal"):
                st.session_state.step = 2
                st.rerun()

# STEP 2: The Reveal & Plot
if st.session_state.step >= 2:
    st.success(f"The TRUE value of p is indeed **{st.session_state.true_p}**!")
    st.write("Let's look at all 100 intervals we generated. If you used the rule 'inside the interval is plausible', you would be right about 95% of the time.")
    
    # Plotting
    fig, ax = plt.subplots(figsize=(10, 6))
    for i, (lower, upper) in enumerate(st.session_state.intervals):
        contains_p = lower <= st.session_state.true_p <= upper
        color = 'green' if contains_p else 'red'
        ax.plot([lower, upper], [i, i], color=color, alpha=0.7)
        ax.scatter([st.session_state.p_hats[i]], [i], color=color, s=10)
    
    ax.axvline(st.session_state.true_p, color='black', linestyle='--', label=f'True p = {st.session_state.true_p}')
    ax.set_xlabel('Proportion')
    ax.set_ylabel('Sample ID (1 to 100)')
    ax.legend()
    st.pyplot(fig)
    
    if st.button("What happens when we get it wrong?"):
        st.session_state.step = 3
        st.rerun()

# STEP 3: The Deep Dive into a "Miss"
if st.session_state.step == 3:
    st.divider()
    if st.session_state.missed_idx is not None:
        m_l, m_u = st.session_state.intervals[st.session_state.missed_idx]
        st.subheader("The Unlucky Sample")
        st.write(f"What would happen if your random sample resulted in this interval: **[{m_l:.2f}, {m_u:.2f}]**?")
        st.write(f"Based on this interval, you would have ruled out **{st.session_state.true_p}** because it is not in the interval.")
        st.write("This is surprising, but as you can see from the plot above, about 5% of perfectly valid random samples will result in an interval that misses the true value entirely. That is the nature of 95% confidence!")
    else:
        st.write("Wow! In this specific simulation, all 100 intervals caught the true p (this happens sometimes!). Click 'Start Over' to run a new simulation.")
        
    if st.button("Start Over"):
        st.session_state.clear()
        st.rerun()