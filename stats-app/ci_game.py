import streamlit as st
import numpy as np
import matplotlib.pyplot as plt
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
        return 0, 1 # Wald interval fails spectacularly here, keeping it simple
    z_score = norm.ppf(1 - (1 - confidence) / 2)
    se = np.sqrt((p_hat * (1 - p_hat)) / n)
    lower = max(0, p_hat - (z_score * se))
    upper = min(1, p_hat + (z_score * se))
    return lower, upper

def generate_all_intervals():
    """Generates a hidden true p, and 100 random intervals."""
    # Hidden True p (secret)
    true_p = round(np.random.uniform(0.20, 0.80), 3)
    n = 100 # Keep sample size consistent
    conf_level = 0.95
    
    intervals = []
    p_hats = []
    
    for _ in range(100):
        # Draw a random sample (binomial)
        x_succ = np.random.binomial(n, true_p)
        p_hat = x_succ / n
        lower, upper = calculate_ci_single(p_hat, n, conf_level)
        intervals.append((lower, upper))
        p_hats.append(p_hat)
        
    return true_p, n, intervals, p_hats

# --- SESSION STATE INITIALIZATION ---
# This ensures we don't pick new random numbers on every click.
if 'game_step' not in st.session_state:
    st.session_state.game_step = 0 # 0=Intro, 1=Animation, 2=Investigation, 3=Reveal
    st.session_state.first_time = True
    st.session_state.is_rigged_miss = False

# --- MAIN APPLICATION FLOW ---

st.title("🧩 The Confidence Interval Detective")

# ==============================================================================
# PHASE 0: The Introduction (The Challenge)
# ==============================================================================
if st.session_state.game_step == 0:
    st.divider()
    st.markdown('<div class="big-font">Your Case, Detective: Find the Secret Population Proportion (p)</div>', unsafe_allow_html=True)
    
    col1, col2 = st.columns(2)
    with col1:
        st.write("I have secretly selected a **true value for p** between 0.200 and 0.800.")
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
# PHASE 1: The "Animation" (Simulating the long run)
# ==============================================================================
elif st.session_state.game_step == 1:
    st.divider()
    st.subheader("Simulating Data Collection...")
    st.write("We are taking 100 perfectly valid random samples of size n=100 and creating 100 unlabeled 95% confidence intervals.")
    
    # Generate the secret data
    t_p, n_s, ints, phats = generate_all_intervals()
    
    # Store secret data in state
    st.session_state.secret_p = t_p
    st.session_state.secret_n = n_s
    st.session_state.all_intervals = ints
    st.session_state.all_phats = phats
    
    # -- Rigging Logic --
    if st.session_state.first_time:
        # Guarantee we pick an interval that MISSED true_p
        miss_indices = [i for i, (l, u) in enumerate(ints) if t_p < l or t_p > u]
        if miss_indices:
            st.session_state.picked_idx = miss_indices[0] # Pick the first available bad one
            st.session_state.is_rigged_miss = True
        else:
            # Unlikely event: all 100 intervals were 'good'. Fall back to random.
            st.session_state.picked_idx = np.random.randint(0, 100)
            st.session_state.is_rigged_miss = False
    else:
        # Standard game: pick an index totally at random
        st.session_state.picked_idx = np.random.randint(0, 100)
        st.session_state.is_rigged_miss = False

    # Perform simple 'animation' flashing random phats
    anim_plot = st.empty()
    st.progress(0)
    
    for i in range(1, 101, 10):
        # Show some random samples scrolling by
        temp_l, temp_u = ints[np.random.randint(0, 100)]
        
        with anim_plot.container():
            fig, ax = plt.subplots(figsize=(6, 2))
            ax.set_title("Generating Sample Intervals...")
            ax.plot([temp_l, temp_u], [0, 0], color='gray', alpha=0.5, linewidth=4)
            ax.set_xlim(0, 1)
            ax.set_xlabel("Unlabeled Proportion")
            ax.set_yticks([]) # Hide y-axis
            st.pyplot(fig)
            time.sleep(0.1) # Rapid scrolling
            st.progress(i)

    time.sleep(0.5)
    st.session_state.game_step = 2
    st.rerun()

# ==============================================================================
# PHASE 2: The Investigation ( Lonely Interval, No truth revealed)
# ==============================================================================
elif st.session_state.game_step >= 2:
    p_idx = st.session_state.picked_idx
    l, u = st.session_state.all_intervals[p_idx]
    
    # Define the "Claimed Value" (which is actually the secret true p)
    # We use this to test interpretation
    claimed_val = st.session_state.secret_p
    
    st.divider()
    st.markdown('<div class="big-font">Step 2: Inspect Your Isolated Interval</div>', unsafe_allow_html=True)
    
    # Visualization: Lonely lonely interval
    fig_lonely, ax_lonely = plt.subplots(figsize=(10, 2.5))
    ax_lonely.set_title("YOUR Collected 95% Confidence Interval")
    ax_lonely.plot([l, u], [0, 0], color='royalblue', linewidth=6, label='Your Interval')
    # Point estimate dot
    ax_lonely.scatter([(l+u)/2], [0], color='royalblue', s=100, zorder=5)
    
    ax_lonely.set_xlim(0, 1)
    ax_lonely.set_xlabel("Sample Proportion (p-hat) context")
    ax_lonely.set_yticks([]) # Hide y-axis
    ax_lonely.grid(axis='x', linestyle='--', alpha=0.3)
    st.pyplot(fig_lonely)
    
    st.write("The random generator handed you this interval.")
    
    # --- Interrogation (Key Interpretations) ---
    st.divider()
    col3, col4 = st.columns([1, 1])
    
    with col3:
        st.markdown('<div class="stat-box">', unsafe_allow_html=True)
        st.write(f"The SECRET true value is **{claimed_val:.3f}** (or whatever the true value of p is).")
        
        interpretation_q = st.radio("Q1: Based *only* on your isolated interval above, what can you conclude about the claimed value of {claimed_val:.3f}?".format(claimed_val=claimed_val),
                                     ["Wait... I'm not ready to answer.",
                                      "{val} is plausible because it is INSIDE the interval, but we cannot say p is EXACTLY {val}.".format(val=claimed_val),
                                      "{val} is ruled out because it is outside the interval.".format(val=claimed_val),
                                      "p is definitely {val} because it is inside the interval.".format(val=claimed_val)],
                                     key="interpretation_q")
        
        # Original req 2 & 3 summary injection
        q1_ans_type = ""
        if interpretation_q.startswith("{val} is plausible".format(val=claimed_val)):
            q1_ans_type = "plausible"
        elif interpretation_q.startswith("{val} is ruled out".format(val=claimed_val)):
            q1_ans_type = "ruled out"

        # Correct MC answer is handled logic below
        if l <= claimed_val <= u:
            # Inside is plausible
            correct_interp_str = "{val} is plausible because it is INSIDE".format(val=claimed_val)
        else:
            # Outside is ruled out
            correct_interp_str = "{val} is ruled out because it is outside".format(val=claimed_val)
            
        st.markdown('</div>', unsafe_allow_html=True)

    with col4:
        st.markdown('<div class="stat-box">', unsafe_allow_html=True)
        st.write("**Wait!** We are playing a game with hidden knowledge.")
        st.write("In the real world, you **only** have your single lonely blue line above. You do NOT get the true p vertical line.")
        
        reality_check_q = st.radio("Q2: In a REAL study, how would you classify your single blue interval right now?",
                                    ["Choose an option...",
                                     "I would feel confident that my interval captured the truth.",
                                     "I would feel unlucky, like I probably missed the truth.",
                                     "It is absolutely impossible to know if my single interval is one of the 95% 'good' ones or 5% 'bad' ones."],
                                    key="reality_check_q")
        
        # Final Req check:
        correct_reality_ans = "It is absolutely impossible to know"

        st.markdown('</div>', unsafe_allow_html=True)

    # Submit button
    if st.session_state.game_step == 2:
        if st.button("Submit Interpretation & Reveal the Secret Context"):
            # Logic check (optional): we could force them to get Q2 correct, 
            # but letting them answer wrong forces them to confront the reveal.
            st.session_state.game_step = 3
            st.rerun()

# ==============================================================================
# PHASE 3: The Grand Reveal & The Full Plot (Transparency Admission)
# ==============================================================================
if st.session_state.game_step == 3:
    st.divider()
    st.markdown('<div class="big-font">Step 3: The Grand Reveal (Context)</div>', unsafe_allow_html=True)
    
    true_p = st.session_state.secret_p
    ints = st.session_state.all_intervals
    p_idx = st.session_state.picked_idx
    l, u = ints[p_idx]
    
    # Visualization: Plot all 100 intervals, highlight user picked
    fig_full, ax_full = plt.subplots(figsize=(10, 6))
    
    # Calculate green/red/blue status
    for i, (lower, upper) in enumerate(ints):
        captured = lower <= true_p <= upper
        
        # Determine alpha/linewidth (dim others, emphasize yours)
        if i == p_idx:
            # Special color for YOUR interval
            captured_by_you = captured
            col_you = 'red' if not captured else 'limegreen' # Show green if we didn't rig it miss
            # Highlight with ROYAL BLUE during lonely phase, but Green/Red during reveal? No, let's highlight with a special thick blue line so they remember which one was theirs.
            ax_full.plot([lower, upper], [i, i], color='royalblue', linewidth=4, alpha=1.0, label='YOUR Investigation')
            ax_full.scatter([(lower+upper)/2], [i], color='royalblue', s=30, zorder=10)
        else:
            # Standard green/red dots/lines
            col = 'green' if captured else 'red'
            ax_full.plot([lower, upper], [i, i], color=col, alpha=0.3, linewidth=1)
            # ax_full.scatter([(lower+upper)/2], [i], color=col, s=5, alpha=0.3)
            
    # Vertical lines for true p (SECRET KNOWLEDGE REVEALED)
    ax_full.axvline(true_p, color='black', linestyle='--', linewidth=2, label=f'Secret Truth p={true_p:.3f}')
    
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
    
    # -- Transparency Check -- (This is the "gotcha" lesson)
    with col5:
        st.markdown('<div class="stat-box">', unsafe_allow_html=True)
        # Check if YOUR blue interval actually captured truth
        captured = l <= true_p <= u
        
        if st.session_state.is_rigged_miss and st.session_state.first_time:
            # We are transparent about the rigging on the first run ONLY.
            st.error("🚨 TRANSPARENCY NOTICE 🚨")
            st.markdown(f"**Yes, we rigged it.** Because this was your first time, the simulation was intentionally programmed to hand you one of the few 'unlucky' (red) samples that misses the hidden truth of p={true_p:.3f}.")
            st.write("---")
            st.write("**The Lesson: Real life sometimes rigs it too.** Statistical methods that are correct 95% of the time, *will naturally fail* 5% of the time. In the real world, you only get ONE blue line. You never know if you got a lucky good sample, or an unlucky 'rigged' sample. You just have to trust the overall mathematical system.")
            
        elif st.session_state.first_time and not st.session_state.is_rigged_miss:
             # In unlikely event rigging failed
             if captured:
                st.success(f"**Result: Luck!** By sheer random chance (we actually tried to rig it against you, but statistical probability intervened!), your interval captured the truth p={true_p:.3f}!")
             else:
                 st.error(f"**Result: Statistical Bad Luck!** By random chance, your interval failed to capture the truth p={true_p:.3f}!")
        else:
            # Subsequent truly random games
            if captured:
                st.success(f"**Result: Luck!** This time, truly at random, your valid statistical process captured the secret truth of p={true_p:.3f}.")
            else:
                st.error(f"**Result: Statistical Bad Luck!** At random, your valid statistical process naturally resulted in an 'unlucky' sample that missed the secret truth of p={true_p:.3f}.")
                
        st.markdown('</div>', unsafe_allow_html=True)

    # -- Pedagogical Evaluation (Reviewing their Q answers) --
    with col6:
        st.markdown('<div class="stat-box">', unsafe_allow_html=True)
        st.subheader("Your Answers vs. Reality")
        
        # Evaluate Q1 (original req 1, 2, 3, 4)
        u_ans1 = st.session_state.interpretation_q
        
        if captured:
             target_interp = "plausible because it is INSIDE"
        else:
             target_interp = "ruled out because it is outside"
             
        # Check correctness of interpretation (ignoring the 'wait' answer)
        if target_interp in u_ans1:
             st.success("✅ **Q1 Interpretation:** You correctly classified p={p_val:.3f} as **{target}** based *only* on the evidence of your isolated interval.".format(p_val=true_p, target=target_interp.split(' ')[0]))
             if captured:
                  st.write("(Pedagogy check: We CANNOT say p is *exactly* {p_val:.3f} even though it's inside.)".format(p_val=true_p))
        else:
             st.error("❌ **Q1 Interpretation:** Your interpretation was incorrect. In your specific game, p={p_val:.3f} was **{target}** your interval, so you should have concluded it was **{final_word}**.".format(p_val=true_p, target=target_interp.split(' ')[4], final_word=target_interp.split(' ')[0]))
             
        # Evaluate Q2 (requested point: user doesn't know)
        u_ans2 = st.session_state.reality_check_q
        target_ans2 = "It is absolutely impossible to know"
        
        if u_ans2 == target_ans2:
             st.success("✅ **Q2 Reality Check:** Spot on, Detective. You *cannot know* if your single line is a good one (green) or bad one (red) unless you have access to the vertical black dashed line of absolute truth.")
        else:
             st.error("❌ **Q2 Reality Check:** Incorrect. You fell for the classic trap! When you only have your single blue interval (isolated lonely plot), it is *impossible* to know if it is one of the 95% successes or 5% failures. That's the nature of statistical confidence!")

        st.markdown('</div>', unsafe_allow_html=True)

    st.divider()
    
    # State transition (turn off rigging)
    if st.session_state.first_time:
         st.session_state.first_time = False
         if st.button("Start Again (Play Truly Random Game)"):
              # Clear data, keep first_time as False
              del st.session_state.secret_p
              st.session_state.game_step = 0
              st.rerun()
    else:
         if st.button("Collect Another truly Random Sample"):
              del st.session_state.secret_p
              st.session_state.game_step = 0
              st.rerun()