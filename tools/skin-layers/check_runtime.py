"""Build gate: verify the bundled face model can execute without a GPU."""
import mediapipe as mp
import numpy as np

with mp.solutions.face_mesh.FaceMesh(static_image_mode=True, refine_landmarks=True,
                                    max_num_faces=1) as mesh:
    result = mesh.process(np.zeros((128, 128, 3), dtype=np.uint8))
    assert not result.multi_face_landmarks
print("Skin layers runtime ready")
