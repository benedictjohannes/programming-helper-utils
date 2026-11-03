package testdata

import "testing"

func NormalFunc() string {
	return "normal"
}

func TestNormalFunc(t *testing.T) {
	if NormalFunc() != "normal" {
		t.Fail()
	}
}

func BenchmarkNormalFunc(b *testing.B) {
	for i := 0; i < b.N; i++ {
		NormalFunc()
	}
}

func ExampleNormalFunc() {
	NormalFunc()
}

func FuzzNormalFunc(f *testing.F) {
	f.Fuzz(func(t *testing.T, s string) {})
}

func TestingHelper() string {
	return "not a test"
}
