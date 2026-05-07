# RoleBridge V1 Specification

## Idea in one line:
An AI interview practice tool that helps career-transition candidates defend and translate their real experience under follow-up pressure.

## Problem Defined:
Most professionals switching roles between different roles, functions or industries can position themselves well enough on paper to get shortlisted, but break down when interviewers probe deeper — answers become vague, inconsistent, or disconnected from the target role's expectations. 

## Product Description:
RoleBridge is an AI interview simulator that helps career-transition candidates defend and translate their real experience under follow-up pressure.
It simulates this follow-up pressure using the candidate's own resume and a target job description, then evaluates whether their spoken answers stay coherent, grounded, and relevant across the session. It scores primarily on clarity, ownership, evidence, role-language transition, and coherence.
The goal is to help people defend the experience they actually have, more credibly and confidently.

## V1 Boundary:
1. V1 will not allow any authentication. Users can directly start the interview session without any login.
2. V1 will ask the user for a mandatory email for later report card delivery.
3. V1 will support both oral and text-based answer submission.
4. V1 will be providing the report card to the user's email only and will not be displayed at the end of the session.
5. V1 will not be generating a quick report card at the end of each session.
6. V1 will allow users to upload one primary resume and one JD per session.
7. V1 will not be storing any details like resume, JD, and such details will be deleted after each session.
8. V1 will allow an interview session of up to 5 mins. Total questions per session are capped at 5 to align with the 5-minute time limit.
9. V1 will be supporting only English language.
10. V1 will use grounded data from the resume and JD to generate highly relevant questions up to 2 levels deep, if needed. Follow-up questions are limited to 2 levels deep per original question.
11. V1 will be providing the report based on ownership, relevance, evidence, role-language transition, clarity, coherence, and an overall feedback with score.
12. V1 will not take delivery signals into consideration.
13. V1 will be explaining the WHY behind each score.
14. V1 will use LLM models with highly relevant system and user prompts to generate questions, analyze answers, evaluate user performance, and provide feedback.
15. V1 will be having only the resume per section focused interview modes and will not have a Full Resume Interview mode.
16. V1 will not be containing any dashboard to monitor overall performance.
17. Each session ends upon completion of one interview. Users can start a new session after the previous session ends.

## Section Mode Defined:
In this mode, the user will be able to select a specific section of their resume to focus on for the interview. For example, the user can select the "Experience" section and the tool will generate questions based on that section only. This mode is useful for users who want to focus on specific areas of their resume.
Each question has a **1-minute** time limit for the user to submit their answer.
Questions are framed to allow users to answer each one within the 1-minute time limit.
Core questions are generated at the start of the session based on the selected resume section and target JD. Follow-up questions are generated dynamically from the user’s answers to probe unclear claims, weak evidence, unclear ownership, or weak relevance to the target role.
If the user's answers meet the rubric's criteria, the AI checks if there are relevant, unmentioned points in the resume that align with the user's answer. 
If yes, AI asks a question to bring that point into the picture. This is to ensure they are aligned with their answer, as well as what is written in their resume.
If the AI confirms grounded claims after cross-referencing with the resume, it proceeds to the next question.
If an answer does not meet rubric criteria, the AI proceeds to the next question without interruption but flags the response for inclusion in the report with a WHY rationale.

## Scoring Dimensions:
1. Clarity:
    - Does the answer have a clear structure?
    - Is it clear and well articulated without rambling?
    - Are the points mentioned easy to follow?

2. Evidence:
    - Does the answer provide specific examples and details to support the claims made?
    - Are the examples relevant to the question asked?
    - Are the claims grounded in the user's actual experience?

3. Ownership:
    - Does the answer demonstrate ownership of the claims made?
    - Does the user take responsibility for the actions and outcomes mentioned?
    - Does the user avoid deflecting blame or minimizing their contribution?

4. Role-language transition:
    - Does the answer use language that is appropriate for the target role?
    - Does the user translate their experience into terms that are relevant to the target role?
    - Does the user avoid using jargon or terminology that is not relevant to the target role?

5. Relevance:
    - Does the answer address the question asked?
    - Is the answer relevant to the target role?
    - Is the answer consistent with the user's resume?

6. Coherence:
    - Does the answer maintain consistency with the user's prior responses across the session?
    - Is the answer logically aligned with the claims made in the user's resume and target JD?
    - Does the answer avoid contradictions when probed with follow-up questions?
    - Does the response demonstrate a logical flow between core answers and subsequent follow-ups?

## Final Report Structure:
The final report includes scores for Clarity, Evidence, Ownership, Role-language Transition, Relevance, and Coherence, with a WHY, transcript evidence, and flags for each dimension.

1. Starts with a two liner depiction of how the interview went with a mention of details beneath.
2. Clarity, rated out of 10, mentions a WHY, mentions the Flag, and gives the precise statements from the user transcript.
3. Evidence, rated out of 10, mentions a WHY, mentions the Flag, and gives the precise statements from the user transcript.
4. Ownership, rated out of 10, mentions a WHY, mentions the Flag, and gives the precise statements from the user transcript.
5. Role-language transition, rated out of 10, mentions a WHY, mentions the Flag, and gives the precise statements from the user transcript.
6. Coherence, rated out of 10, mentions a WHY, mentions the Flag, and gives the precise statements from the user transcript.
7. Overall Impression out of 10, mentions bullet points of Strengths and Weaknesses and Points to Improve.


## Smallest meaningful MVP
1. User lands on page.
2. User enters an email.
3. User uploads resume.
4. User pastes the JD.
5. User selects one resume section.
6. System generates 2-3 core questions from the selected section + JD.
7. Interview runs for upto 4-6 prompts total, with dynamic followup questions based on previous answers.
8. System stores transcript temporarily.
9. System generates one final report with 6 dimensions: Clarity, Evidence, Ownership, Role-language transition, Relevance, Coherence and an Overall Impression.
10. Report is emailed.
11. Session data is deleted after report geenration flow completes.


## User Flow
1. User lands on page by typing the url of the product.
2. User enters an email and gets a reason to why to enter the email(which is for sending the final report).
3. User uploads resume through a button which accepts resume in pdf format.
4. User pastes the JD in the text box below the button to upload the resume. User is provided with a hint in the text box that the JD will be used to generate the questions.
5. User selects one resume section in the same page and the options are Work Experience, Projects, Skills.
6. System generates 2-3 core questions from the selected section + JD.
7. Interview runs for upto 4-6 prompts total, with dynamic followup questions based on previous answers.
8. System stores transcript temporarily.
9. System generates one final report with 6 dimensions: Clarity, Evidence, Ownership, Role-language transition, Relevance, Coherence and an Overall Impression.
10. Report is emailed.
11. Session data is deleted after report geenration flow completes.