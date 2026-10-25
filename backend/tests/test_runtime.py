import unittest
from backend.runtime import select_device


class RuntimeTests(unittest.TestCase):
    def test_auto_requires_cuda_in_both_engines(self):
        self.assertEqual(select_device('auto', True, True), 'cuda')
        self.assertEqual(select_device('auto', False, True), 'cpu')
        self.assertEqual(select_device('auto', True, False), 'cpu')

    def test_explicit_gpu_does_not_silently_fall_back_to_cpu(self):
        with self.assertRaises(RuntimeError):
            select_device('cuda', False, True)
        self.assertEqual(select_device('cpu', True, True), 'cpu')


if __name__ == '__main__':
    unittest.main()
