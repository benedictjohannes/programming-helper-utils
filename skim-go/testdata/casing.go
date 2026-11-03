package testdata

type Item struct {
	ID int
}

var item = 42

func (i Item) GetID() int {
	return i.ID
}

func getItem() int {
	return item
}
