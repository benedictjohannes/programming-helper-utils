package testdata

type ComplexUser struct {
	ID       int64  `json:"id" db:"user_id" validate:"required"`
	Username string `json:"username,omitempty" db:"user_name"`
	Email    string `json:"email" xml:"Email"`
	IsActive bool   `json:"is_active"`
	Score    float64
}

type Greeter interface {
	Greet(name string) (greeting string, err error)
	Bye()
}
