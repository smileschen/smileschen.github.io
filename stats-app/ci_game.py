import streamlit as st
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.ticker import MultipleLocator
from scipy.stats import norm
import time

# --- SETUP & CONFIGURATION ---
st.set_page_config(page_title="The CI Detective", layout="wide", initial_sidebar_state="collapsed")

# Simple custom CSS for styling
st.markdown("""
    <style>
    .big-font { font-size:1.4rem; color: #31333F; margin-bottom:1rem;}
    .stat-box { background-color: #f0f2f6; border-radius: 10px; padding: 1.5rem; margin: 1rem 0; }
    </style>
    """, unsafe_allow_html=True)

# --- HELPER FUNCTIONS ---
def calculate_ci_single(p_hat, n, confidence=0.95):
    """Calculates standard Wald confidence interval for a single proportion."""
    if p_hat == 0 or p_hat == 1:
        return 0, 1 
    z_score = norm.ppf(1 - (1 - confidence) / 2)
    se = np.sqrt((p_hat * (1 - p_hat)) / n)
    lower = max(0, p_hat - (z_score * se))
    upper = min(1, p_hat + (z_score * se))
    return lower, upper

def generate_all_intervals():
    """Generates a hidden true p, and 100 random intervals."""
    true_p = round(np.random.uniform(0.20, 0.80), 2)
    n = 100 
    conf_level = 0.95
    
    intervals = []
    p_hats = []
    
    for _ in range(100):
        x_succ = np.random.binomial(n, true_p)
        p_hat = x_succ / n
        lower, upper = calculate_ci_single(p_hat, n, conf_level)
        intervals.append((lower, upper))
        p_hats.append(p_hat)
        
    return true_p, n, intervals, p_hats

# --- SESSION STATE INITIALIZATION ---
if 'game_step' not in st.session_state:
    st.session_state.game_step = 0 
    st.session_state.first_time = True
    st.session_state.is_rigged_miss = False

# --- MAIN APPLICATION FLOW ---
st.title("🧩 The Confidence Interval Detective")

# ==============================================================================
# PHASE 0: The Introduction 
# ==============================================================================
if st.session_state.game_step == 0:
    st.divider()
    st.markdown('<div class="big-font">Your Case, Detective: Find the Secret Population Proportion (p)</div>', unsafe_allow_html=True)
    
    col1, col2 = st.columns(2)
    with col1:
        st.write("I have secretly selected a **true value for p** between 0.20 and 0.80.")
        st.write("You cannot know the truth! But you are allowed to collect a single random sample.")
        st.write("We will use your ONE sample to calculate a 95% Confidence Interval.")
        
        if st.button("Collect My Random Sample"):
            st.session_state.game_step = 1
            st.rerun()
            
    with col2:
        st.markdown('<div class="stat-box">', unsafe_allow_html=True)
        st.markdown("##### The Challenge")
        st.write("Can you correctly interpret what your single interval tells you about the *hidden* truth? Don't fall for the classic traps!")
        st.markdown('</div>', unsafe_allow_html=True)

# ==============================================================================
# PHASE 1: The "Animation" 
# ==============================================================================
elif st.session_state.game_step == 1:
    st.divider()
    st.subheader("Simulating Data Collection...")
    st.write("We are taking 100 perfectly valid random samples of size n=100 and creating 100 unlabeled 95% confidence intervals.")
    
    t_p, n_s, ints, phats = generate_all_intervals()
    
    st.session_state.secret_p = t_p
    st.session_state.secret_n = n_s
    st.session_state.all_intervals = ints
    st.session_state.all_phats = phats
    
    if st.session_state.first_time:
        miss_indices = [i for i, (l, u) in enumerate(ints) if t_p < l or t_p > u]
        if miss_indices:
            st.session_state.picked_idx = miss_indices[0] 
            st.session_state.is_rigged_miss = True
        else:
            st.session_state.picked_idx = np.random.randint(0, 100)
            st.session_state.is_rigged_miss = False
    else:
        st.session_state.picked_idx = np.random.randint(0, 100)
        st.session_state.is_rigged_miss = False

    anim_plot = st.empty()
    st.progress(0)
    
    for i in range(1, 101, 10):
        temp_l, temp_u = ints[np.random.randint(0, 100)]
        
        with anim_plot.container():
            fig, ax = plt.subplots(figsize=(10, 1.8))
            ax.set_title("Generating Sample Intervals...")
            
            # Formatting identical to Phase 2
            ax.xaxis.set_major_locator(MultipleLocator(0.05))
            ax.grid(axis='x', linestyle='--', alpha=0.5)
            
            ax.plot([temp_l, temp_u], [0, 0], color='gray', alpha=0.5, linewidth=4)
            ax.set_xlim(0, 1)
            ax.set_xlabel("Unlabeled Proportion")
            ax.set_yticks([]) 
            st.pyplot(fig)
            time.sleep(0.1) 
            st.progress(i)

    time.sleep(0.5)
    st.session_state.game_step = 2
    st.rerun()

# ==============================================================================
# PHASE 2: The Investigation
# ==============================================================================
elif st.session_state.game_step >= 2:
    p_idx = st.session_state.picked_idx
    l, u = st.session_state.all_intervals[p_idx]
    claimed_val = st.session_state.secret_p
    
    st.divider()
    st.markdown('<div class="big-font">Step 2: Inspect Your Isolated Interval</div>', unsafe_allow_html=True)
    
    fig_lonely, ax_lonely = plt.subplots(figsize=(10, 1.8))
    ax_lonely.set_title("YOUR Collected 95% Confidence Interval")
    
    ax_lonely.xaxis.set_major_locator(MultipleLocator(0.05))
    ax_lonely.grid(axis='x', linestyle='--', alpha=0.5)
    ax_lonely.axvline(claimed_val, color='blue', linestyle='-', alpha=0.3, linewidth=2, label='Claimed Value')
    
    ax_lonely.plot([l, u], [0, 0], color='royalblue', linewidth=6, label='Your Interval')
    ax_lonely.scatter([(l+u)/2], [0], color='royalblue', s=100, zorder=5)
    
    ax_lonely.set_xlim(0, 1)
    ax_lonely.set_xlabel("Sample Proportion (p-hat) context")
    ax_lonely.set_yticks([]) 
    st.pyplot(fig_lonely)
    
    st.write("The random generator handed you this interval.")
    
    st.divider()
    col3, col4 = st.columns([1, 1])
    
    # Store exact strings for precise evaluation in Step 3
    q1_opt_plausible = f"{claimed_val:.2f} is plausible because it is INSIDE the interval, but we cannot say p is EXACTLY {claimed_val:.2f}."
    q1_opt_ruled_out = f"{claimed_val:.2f} is ruled out because it is outside the interval."
    q1_opt_definitely = f"p is definitely {claimed_val:.2f} because it is inside the interval."
    
    q2_opt_certain = "I am absolutely certain the true p is in this interval."
    q2_opt_confident = "I am 95% confident the true p is in this interval, acknowledging a 5% chance of an unlucky sample."
    q2_opt_impossible = "It is impossible to make any statement about this interval without knowing the true p."

    with col3:
        st.markdown('<div class="stat-box">', unsafe_allow_html=True)
        st.markdown(f"**The Claim:** The claim is that the secret true proportion is **{claimed_val:.2f}**.")
        
        st.radio("Q1: Based *only* on your isolated interval above, what can you conclude about the claimed value of {claimed_val:.2f}?".format(claimed_val=claimed_val),
                 ["Wait... I'm not ready to answer.", q1_opt_plausible, q1_opt_ruled_out, q1_opt_definitely],
                 key="interpretation_q")
        st.markdown('</div>', unsafe_allow_html=True)

    with col4:
        st.markdown('<div class="stat-box">', unsafe_allow_html=True)
        st.write("**Wait!** We are playing a game with hidden knowledge.")
        st.write("In the real world, you **only** have your single lonely blue line above. You do NOT get to see the overall reality.")
        
        st.radio("Q2: In a REAL study, how would you classify your single blue interval right now?",
                 ["Choose an option...", q2_opt_certain, q2_opt_confident, q2_opt_impossible],
                 key="reality_check_q")
        st.markdown('</div>', unsafe_allow_html=True)

    if st.session_state.game_step == 2:
        if st.button("Submit Interpretation & Reveal the Secret Context"):
            st.session_state.game_step = 3
            st.rerun()

# ==============================================================================
# PHASE 3: The Grand Reveal 
# ==============================================================================
if st.session_state.game_step == 3:
    st.divider()
    st.markdown('<div class="big-font">Step 3: The Grand Reveal (Context)</div>', unsafe_allow_html=True)
    
    true_p = st.session_state.secret_p
    ints = st.session_state.all_intervals
    p_idx = st.session_state.picked_idx
    l, u = ints[p_idx]
    
    fig_full, ax_full = plt.subplots(figsize=(10, 6))
    
    for i, (lower, upper) in enumerate(ints):
        captured = lower <= true_p <= upper
        if i == p_idx:
            ax_full.plot([lower, upper], [i, i], color='royalblue', linewidth=4, alpha=1.0, label='YOUR Investigation')
            ax_full.scatter([(lower+upper)/2], [i], color='royalblue', s=30, zorder=10)
        else:
            col = 'green' if captured else 'red'
            ax_full.plot([lower, upper], [i, i], color=col, alpha=0.3, linewidth=1)
            
    ax_full.axvline(true_p, color='black', linestyle='--', linewidth=2, label=f'Secret Truth p={true_p:.2f}')
    ax_full.set_xlim(0, 1)
    ax_full.set_xlabel("Proportion")
    ax_full.set_ylabel("Sample Number (1-100)")
    ax_full.legend(loc='lower right')
    ax_full.set_title("The Long Run: 100 Valid 95% Confidence Intervals")
    ax_full.grid(axis='x', linestyle='--', alpha=0.3)
    st.pyplot(fig_full)
    
    # ==========================================================================
    # --- Interpretation Feedback & Transparency ---
    # ==========================================================================
    st.divider()
    
    col5, col6 = st.columns([1, 1])
    
    with col5:
        st.markdown('<div class="stat-box">', unsafe_allow_html=True)
        captured = l <= true_p <= u
        
        if st.session_state.is_rigged_miss and st.session_state.first_time:
            st.error("🚨 TRANSPARENCY NOTICE 🚨")
            st.markdown(f"**Yes, we rigged it.** Because this was your first time, the simulation was intentionally programmed to hand you one of the few 'unlucky' (red) samples that misses the hidden truth of p={true_p:.2f}.")
            st.write("---")
            st.write("**The Lesson: Real life sometimes produces random results that lead you to the wrong conclusion.** Statistical methods that are correct 95% of the time, *will naturally fail* 5% of the time. In the real world, you only get ONE blue line. You never know if you got a lucky good sample, or an unlucky sample. You just have to trust the overall mathematical system.")
            
        elif st.session_state.first_time and not st.session_state.is_rigged_miss:
             if captured:
                st.success(f"**Result: Luck!** By sheer random chance, your interval captured the truth p={true_p:.2f}!")
             else:
                 st.error(f"**Result: Statistical Bad Luck!** By random chance, your interval failed to capture the truth p={true_p:.2f}!")
        else:
            if captured:
                st.success(f"**Result: Luck!** This time, truly at random, your valid statistical process captured the secret truth of p={true_p:.2f}.")
            else:
                st.error(f"**Result: Statistical Bad Luck!** At random, your valid statistical process naturally resulted in an 'unlucky' sample that missed the secret truth of p={true_p:.2f}.")
                
        st.markdown('</div>', unsafe_allow_html=True)

    with col6:
        st.markdown('<div class="stat-box">', unsafe_allow_html=True)
        st.subheader("Your Answers vs. Reality")
        
        # --- Evaluate Q1 ---
        u_ans1 = st.session_state.interpretation_q
        
        if captured:
            if "plausible" in u_ans1:
                st.success(f"✅ **Q1 Interpretation:** Correct! You evaluated p={true_p:.2f} accurately based only on the evidence of your isolated interval.")
            elif "ruled out" in u_ans1:
                st.error(f"❌ **Q1 Interpretation:** Incorrect. In your specific game, p={true_p:.2f} was INSIDE your interval, so it is a plausible value.")
            elif "definitely" in u_ans1:
                st.error(f"❌ **Q1 Interpretation:** Incorrect. Even though {true_p:.2f} is inside the interval, we cannot be certain that p is exactly equal to {true_p:.2f}.")
        else:
            if "ruled out" in u_ans1:
                st.success(f"✅ **Q1 Interpretation:** Correct! You evaluated p={true_p:.2f} accurately based only on the evidence of your isolated interval.")
            elif "plausible" in u_ans1:
                st.error(f"❌ **Q1 Interpretation:** Incorrect. In your specific game, p={true_p:.2f} was OUTSIDE your interval, so it is ruled out.")
            elif "definitely" in u_ans1:
                st.error(f"❌ **Q1 Interpretation:** Incorrect. {true_p:.2f} is NOT inside your interval, so it cannot be definitely true.")
             
        # --- Evaluate Q2 --- 
        u_ans2 = st.session_state.reality_check_q
        
        if "acknowledging a 5% chance" in u_ans2:
             st.success("✅ **Q2 Reality Check:** Spot on, Detective. You cannot be certain, but you can be confident. You trust the procedure, knowing it works 95% of the time, while accepting the 5% risk of being wrong.")
        elif "absolutely certain" in u_ans2:
             st.error("❌ **Q2 Reality Check:** Incorrect. You fell for the certainty trap! You can be 95% confident in your interval, but you can never be absolutely certain.")
        elif "impossible to make any statement" in u_ans2:
             st.error("❌ **Q2 Reality Check:** Incorrect. Don't fall into statistical nihilism! It is not impossible to make a statement. You are allowed to be 95% confident, as long as you accept the 5% risk of failure.")

        st.markdown('</div>', unsafe_allow_html=True)

    st.divider()
    
    if st.session_state.first_time:
         st.session_state.first_time = False
         if st.button("Start Again (Play Truly Random Game)"):
              del st.session_state.secret_p
              st.session_state.game_step = 0
              st.rerun()
    else:
         if st.button("Collect Another truly Random Sample"):
              del st.session_state.secret_p
              st.session_state.game_step = 0
              st.rerun()