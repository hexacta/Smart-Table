(function (ng, undefined){
    'use strict';

ng.module('smart-table', []).run(['$templateCache', function ($templateCache) {
    $templateCache.put('template/smart-table/pagination.html',
        '<nav ng-if="pages.length >= 2"><ul class="pagination">' +
        '<li ng-repeat="page in pages" ng-class="{active: page==currentPage}"><a ng-click="selectPage(page)">{{page}}</a></li>' +
        '</ul></nav>');
}]);


ng.module('smart-table')
  .constant('stConfig', {
    pagination: {
      template: 'template/smart-table/pagination.html',
      itemsByPage: 10,
      displayedPages: 5
    },
    search: {
      delay: 400 // ms
    },
    select: {
      mode: 'single',
      selectedClass: 'st-selected'
    },
    sort: {
      ascentClass: 'st-sort-ascent',
      descentClass: 'st-sort-descent',
      skipNatural: false
    },
    pipe: {
      delay: 100 //ms
    },
    searchType: {
      server: true
    }
  });
ng.module('smart-table')
  .controller('stTableController', ['$scope', '$parse', '$filter', '$attrs', 'stConfig', function StTableController ($scope, $parse, $filter, $attrs, stConfig) {
    var propertyName = $attrs.stTable;
    var localSearch = $attrs.localSearch =='true' || false;
    var displayGetter = $parse(propertyName);
    var displaySetter = displayGetter.assign;
    var safeGetter;
    var orderBy = $filter('orderBy');
    var filter = $filter('filter');
    var safeCopy = copyRefs(displayGetter($scope));
    var tableState = {
      sort: {},
      search: {},
      pagination: {
        start: 0
      },
      columns: []
    };
    var filtered;
    var pipeAfterSafeCopy = true;
    var ctrl = this;
    var lastSelected;
    var elements = {count: 0};

    function copyRefs (src) {
      return src ? [].concat(src) : [];
    }

    function updateSafeCopy () {
      safeCopy = copyRefs(safeGetter($scope));
      if (pipeAfterSafeCopy === true) {
        ctrl.pipe();
      }
    }

    if ($attrs.stSafeSrc) {
      safeGetter = $parse($attrs.stSafeSrc);
      $scope.$watch(function () {
        var safeSrc = safeGetter($scope);
        return safeSrc ? safeSrc.length : 0;

      }, function (newValue, oldValue) {
        if (newValue !== safeCopy.length) {
          updateSafeCopy();
        }
      });
      $scope.$watch(function () {
        return safeGetter($scope);
      }, function (newValue, oldValue) {
        if (newValue !== oldValue) {
          updateSafeCopy();
        }
      });
    }

    /**
     * sort the rows
     * @param {Function | String} predicate - function or string which will be used as predicate for the sorting
     * @param [reverse] - if you want to reverse the order
     */
    this.sortBy = function sortBy (predicate, reverse) {
      tableState.sort.predicate = predicate;
      tableState.sort.reverse = reverse === true;

      if (ng.isFunction(predicate)) {
        tableState.sort.functionName = predicate.name;
      } else {
        delete tableState.sort.functionName;
      }

      tableState.pagination.start = 0;
      return this.pipe();
    };

    /**
     * search matching rows
     * @param {String} input - the input string
     * @param {String} [predicate] - the property name against you want to check the match, otherwise it will search on all properties
     */
    this.search = function search (input, predicate) {
      var predicateObject = tableState.search.predicateObject || {};
      var prop = predicate ? predicate : '$';

      input = ng.isString(input) ? input.trim() : input;
      predicateObject[prop] = input;
      // to avoid to filter out null value
      if (!input) {
        delete predicateObject[prop];
      }
      tableState.search.predicateObject = predicateObject;
      tableState.pagination.start = 0;
      return this.pipe();
    };

    /**
     * this will chain the operations of sorting and filtering based on the current table state (sort options, filtering, ect)
     */
    this.pipe = function pipe () {
      if(localSearch) {
        this.localSearch();
      }
      else {
        this.serverSearch();
      }
    };

    this.serverSearch = function serverSearch() {
      var self = this;
      var pagination = tableState.pagination;
      var params = {
        orderBy: tableState.sort.predicate,
        reverse: tableState.sort.reverse,
        filter: tableState.search.predicateObject? tableState.search.predicateObject.$ : undefined,
        offset: pagination.start,
        pageSize: pagination.number,
        columns: tableState.columns
      };

      $scope[$attrs.stSearchFn](params).then(function (res) {
        elements.count = res[0].length;
        filtered = res[0].collection;
        var output = self.paginate(pagination, res[0].length);
        if(params.offset == pagination.start){
          displaySetter($scope, output || filtered);
        } else{
          params.offset = pagination.start;
          $scope[$attrs.stSearchFn](params).then(function (res){
            filtered = res[0].collection;
            displaySetter($scope, filtered);
          })
        }
      });
    };

    this.localSearch = function localSearch() {
      var self = this;
      var pagination = tableState.pagination;
      filtered = tableState.search.predicateObject ? filter(safeCopy, tableState.search.predicateObject) : safeCopy;
      if (tableState.sort.predicate) {
        filtered = orderBy(filtered, tableState.sort.predicate, tableState.sort.reverse);
      }
      var output = self.paginate(pagination, filtered.length);
      displaySetter($scope, output || filtered);
      elements.count = safeCopy.length;
    };

    this.paginate = function paginate (pagination, collectionLength) {
      if (pagination.number !== undefined) {
        pagination.numberOfPages = collectionLength > 0 ? Math.ceil(collectionLength / pagination.number) : 1;
        pagination.start = pagination.start >= collectionLength ? (pagination.numberOfPages - 1) * pagination.number : pagination.start;
        if(localSearch){
          return filtered.slice(pagination.start, pagination.start + pagination.number);
        } else{
          return null;
        }
      }
      else {
        return [];
      }
    };

    /**
     * select a dataRow (it will add the attribute isSelected to the row object)
     * @param {Object} row - the row to select
     * @param {String} [mode] - "single" or "multiple" (multiple by default)
     */
    this.select = function select (row, mode) {
      var rows = copyRefs(displayGetter($scope));
      var index = rows.indexOf(row);
      if (index !== -1) {
        if (mode === 'single') {
          row.isSelected = row.isSelected !== true;
          if (lastSelected) {
            lastSelected.isSelected = false;
          }
          lastSelected = row.isSelected === true ? row : undefined;
        } else {
          rows[index].isSelected = !rows[index].isSelected;
        }
      }
    };

    /**
     * take a slice of the current sorted/filtered collection (pagination)
     *
     * @param {Number} start - start index of the slice
     * @param {Number} number - the number of item in the slice
     */
    this.slice = function splice (start, number) {
      tableState.pagination.start = start;
      tableState.pagination.number = number;
      return this.pipe();
    };

    /**
     * return the current state of the table
     * @returns {{sort: {}, search: {}, pagination: {start: number}}}
     */
    this.tableState = function getTableState () {
      return tableState;
    };

    this.getFilteredCollection = function getFilteredCollection () {
      return filtered || safeCopy;
    };

    /**
     * Use a different filter function than the angular FilterFilter
     * @param filterName the name under which the custom filter is registered
     */
    this.setFilterFunction = function setFilterFunction (filterName) {
      filter = $filter(filterName);
    };

    /**
     * Use a different function than the angular orderBy
     * @param sortFunctionName the name under which the custom order function is registered
     */
    this.setSortFunction = function setSortFunction (sortFunctionName) {
      orderBy = $filter(sortFunctionName);
    };

    /**
     * Usually when the safe copy is updated the pipe function is called.
     * Calling this method will prevent it, which is something required when using a custom pipe function
     */
    this.preventPipeOnWatch = function preventPipe () {
      pipeAfterSafeCopy = false;
    };

    this.getElements = function getElements() {
      return elements;
    };

  }])
  .directive('stTable', function () {
    return {
      restrict: 'A',
      controller: 'stTableController',
      link: function (scope, element, attr, ctrl) {

        if (attr.stSetFilter) {
          ctrl.setFilterFunction(attr.stSetFilter);
        }

        if (attr.stSetSort) {
          ctrl.setSortFunction(attr.stSetSort);
        }
      }
    };
  });

ng.module('smart-table')
  .directive('stSearch', ['stConfig', '$timeout', function (stConfig, $timeout) {
    return {
      require: '^stTable',
      link: function (scope, element, attr, ctrl) {
        var tableCtrl = ctrl;
        var promise = null;
        var throttle = attr.stDelay || stConfig.search.delay;

        attr.$observe('stSearch', function (newValue, oldValue) {
          var input = element[0].value;
          if (newValue !== oldValue && input) {
            ctrl.tableState().search = {};
            tableCtrl.search(input, newValue);
          }
        });

        //table state -> view
        scope.$watch(function () {
          return ctrl.tableState().search;
        }, function (newValue, oldValue) {
          var predicateExpression = attr.stSearch || '$';
          if (newValue.predicateObject && newValue.predicateObject[predicateExpression] !== element[0].value) {
            element[0].value = newValue.predicateObject[predicateExpression] || '';
          }
        }, true);

        // view -> table state
        element.bind('input', function (evt) {
          evt = evt.originalEvent || evt;
          if (promise !== null) {
            $timeout.cancel(promise);
          }

          promise = $timeout(function () {
            tableCtrl.search(evt.target.value, attr.stSearch || '');
            promise = null;
          }, throttle);
        });
      }
    };
  }]);

ng.module('smart-table')
  .directive('stSearchButton', ['stConfig', '$timeout', function (stConfig, $timeout) {
    return {
      require: '^stTable',
      link: function (scope, element, attr, ctrl) {
        element.bind('click', function (evt) {
          if(attr.type == 'button'){
            ctrl.pipe();
          }
        });
      }
    };
  }]);

ng.module('smart-table')
  .directive('stSelectRow', ['stConfig', function (stConfig) {
    return {
      restrict: 'A',
      require: '^stTable',
      scope: {
        row: '=stSelectRow'
      },
      link: function (scope, element, attr, ctrl) {
        var mode = attr.stSelectMode || stConfig.select.mode;
        element.bind('click', function () {
          scope.$apply(function () {
            ctrl.select(scope.row, mode);
          });
        });

        scope.$watch('row.isSelected', function (newValue) {
          if (newValue === true) {
            element.addClass(stConfig.select.selectedClass);
          } else {
            element.removeClass(stConfig.select.selectedClass);
          }
        });
      }
    };
  }]);

ng.module('smart-table')
  .directive('stSort', ['stConfig', '$parse', function (stConfig, $parse) {
    return {
      restrict: 'A',
      require: '^stTable',
      link: function (scope, element, attr, ctrl) {

        var predicate = attr.stSort;
        var getter = $parse(predicate);
        var index = 0;
        var classAscent = attr.stClassAscent || stConfig.sort.ascentClass;
        var classDescent = attr.stClassDescent || stConfig.sort.descentClass;
        var stateClasses = [classAscent, classDescent];
        var sortDefault;
        var skipNatural = attr.stSkipNatural !== undefined ? attr.stSkipNatural : stConfig.skipNatural;

        if (attr.stSortDefault) {
          sortDefault = scope.$eval(attr.stSortDefault) !== undefined ? scope.$eval(attr.stSortDefault) : attr.stSortDefault;
        }

        ctrl.tableState().columns.push(predicate);

        //view --> table state
        function sort () {
          index++;
          predicate = ng.isFunction(getter(scope)) ? getter(scope) : attr.stSort;
          if (index % 3 === 0 && !!skipNatural !== true) {
            //manual reset
            index = 0;
            ctrl.tableState().sort = {};
            ctrl.tableState().pagination.start = 0;
            ctrl.pipe();
          } else {
            ctrl.sortBy(predicate, index % 2 === 0);
          }
        }

        element.bind('click', function sortClick () {
          if (predicate) {
            scope.$apply(sort);
          }
        });

        if (sortDefault) {
          index = sortDefault === 'reverse' ? 1 : 0;
          sort();
        }

        //table state --> view
        scope.$watch(function () {
          return ctrl.tableState().sort;
        }, function (newValue) {
          if (newValue.predicate !== predicate) {
            index = 0;
            element
              .removeClass(classAscent)
              .removeClass(classDescent);
          } else {
            index = newValue.reverse === true ? 2 : 1;
            element
              .removeClass(stateClasses[index % 2])
              .addClass(stateClasses[index - 1]);
          }
        }, true);
      }
    };
  }]);

ng.module('smart-table')
  .directive('stPagination', ['stConfig', function (stConfig) {
    return {
      restrict: 'EA',
      require: '^stTable',
      scope: {
        stItemsByPage: '=?',
        stDisplayedPages: '=?',
        stPageChange: '&'
      },
      templateUrl: function (element, attrs) {
        if (attrs.stTemplate) {
          return attrs.stTemplate;
        }
        return stConfig.pagination.template;
      },
      link: function (scope, element, attrs, ctrl) {

        scope.stItemsByPage = scope.stItemsByPage ? +(scope.stItemsByPage) : stConfig.pagination.itemsByPage;
        scope.stDisplayedPages = scope.stDisplayedPages ? +(scope.stDisplayedPages) : stConfig.pagination.displayedPages;

        scope.currentPage = 1;
        scope.pages = [];
        scope.elements = ctrl.getElements();

        function redraw () {
          var paginationState = ctrl.tableState().pagination;
          var start = 1;
          var end;
          var i;
          var prevPage = scope.currentPage;
          scope.currentPage = Math.floor(paginationState.start / paginationState.number) + 1;

          start = Math.max(start, scope.currentPage - Math.abs(Math.floor(scope.stDisplayedPages / 2)));
          end = start + scope.stDisplayedPages;

          if (end > paginationState.numberOfPages) {
            end = paginationState.numberOfPages + 1;
            start = Math.max(1, end - scope.stDisplayedPages);
          }

          scope.pages = [];
          scope.numPages = paginationState.numberOfPages;

          if (paginationState.numberOfPages){
            for (i = start; i < end; i++) {
              scope.pages.push(i);
            }
          }

          if (prevPage !== scope.currentPage) {
            scope.stPageChange({newPage: scope.currentPage});
          }
        }

        //table state --> view
        scope.$watch(function () {
          return ctrl.tableState().pagination;
        }, redraw, true);

        //scope --> table state  (--> view)
        scope.$watch('stItemsByPage', function (newValue, oldValue) {
          if (newValue !== oldValue) {
            scope.selectPage(1);
          }
        });

        scope.$watch('stDisplayedPages', redraw);

        //view -> table state
        scope.selectPage = function (page) {
          if (page > 0 && page <= scope.numPages) {
            ctrl.slice((page - 1) * scope.stItemsByPage, scope.stItemsByPage);
          }
        };

        if (!ctrl.tableState().pagination.number) {
          ctrl.slice(0, scope.stItemsByPage);
        }
      }
    };
  }]);

ng.module('smart-table')
  .directive('stPipe', ['stConfig', '$timeout', function (config, $timeout) {
    return {
      require: 'stTable',
      scope: {
        stPipe: '='
      },
      link: {

        pre: function (scope, element, attrs, ctrl) {

          var pipePromise = null;

          if (ng.isFunction(scope.stPipe)) {
            ctrl.preventPipeOnWatch();
            ctrl.pipe = function () {

              if (pipePromise !== null) {
                $timeout.cancel(pipePromise)
              }

              pipePromise = $timeout(function () {
                scope.stPipe(ctrl.tableState(), ctrl);
              }, config.pipe.delay);

              return pipePromise;
            }
          }
        },

        post: function (scope, element, attrs, ctrl) {
          ctrl.pipe();
        }
      }
    };
  }]);

ng.module('smart-table')
  .directive('stResetFilter', ['$parse', function ($parse) {
        return {
            restrict: 'A',
            require: '^stTable',
            link: function (scope, element, attr, ctrl) {
                var tableCtrl = ctrl;
                var fn = $parse(attr['stResetFilter']);

                element.on('click', function (event) {
                    ctrl.tableState().search = {};
                    tableCtrl.search('', '');
                    scope.$apply(function () {
                        fn(scope, {
                            $event: event
                        })
                    });
                });
            }
        };
  }]);
})(angular);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy90b3AudHh0Iiwic3JjL3NtYXJ0LXRhYmxlLm1vZHVsZS5qcyIsInNyYy9zdENvbmZpZy5qcyIsInNyYy9zdFRhYmxlLmpzIiwic3JjL3N0U2VhcmNoLmpzIiwic3JjL3N0U2VhcmNoQnV0dG9uLmpzIiwic3JjL3N0U2VsZWN0Um93LmpzIiwic3JjL3N0U29ydC5qcyIsInNyYy9zdFBhZ2luYXRpb24uanMiLCJzcmMvc3RQaXBlLmpzIiwic3JjL3N0UmVzZXRGaWx0ZXIuanMiLCJzcmMvYm90dG9tLnR4dCJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMzUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNsRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDcEJBIiwiZmlsZSI6InNtYXJ0LXRhYmxlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIChuZywgdW5kZWZpbmVkKXtcclxuICAgICd1c2Ugc3RyaWN0JztcclxuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScsIFtdKS5ydW4oWyckdGVtcGxhdGVDYWNoZScsIGZ1bmN0aW9uICgkdGVtcGxhdGVDYWNoZSkge1xyXG4gICAgJHRlbXBsYXRlQ2FjaGUucHV0KCd0ZW1wbGF0ZS9zbWFydC10YWJsZS9wYWdpbmF0aW9uLmh0bWwnLFxyXG4gICAgICAgICc8bmF2IG5nLWlmPVwicGFnZXMubGVuZ3RoID49IDJcIj48dWwgY2xhc3M9XCJwYWdpbmF0aW9uXCI+JyArXHJcbiAgICAgICAgJzxsaSBuZy1yZXBlYXQ9XCJwYWdlIGluIHBhZ2VzXCIgbmctY2xhc3M9XCJ7YWN0aXZlOiBwYWdlPT1jdXJyZW50UGFnZX1cIj48YSBuZy1jbGljaz1cInNlbGVjdFBhZ2UocGFnZSlcIj57e3BhZ2V9fTwvYT48L2xpPicgK1xyXG4gICAgICAgICc8L3VsPjwvbmF2PicpO1xyXG59XSk7XHJcblxyXG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcclxuICAuY29uc3RhbnQoJ3N0Q29uZmlnJywge1xyXG4gICAgcGFnaW5hdGlvbjoge1xyXG4gICAgICB0ZW1wbGF0ZTogJ3RlbXBsYXRlL3NtYXJ0LXRhYmxlL3BhZ2luYXRpb24uaHRtbCcsXHJcbiAgICAgIGl0ZW1zQnlQYWdlOiAxMCxcclxuICAgICAgZGlzcGxheWVkUGFnZXM6IDVcclxuICAgIH0sXHJcbiAgICBzZWFyY2g6IHtcclxuICAgICAgZGVsYXk6IDQwMCAvLyBtc1xyXG4gICAgfSxcclxuICAgIHNlbGVjdDoge1xyXG4gICAgICBtb2RlOiAnc2luZ2xlJyxcclxuICAgICAgc2VsZWN0ZWRDbGFzczogJ3N0LXNlbGVjdGVkJ1xyXG4gICAgfSxcclxuICAgIHNvcnQ6IHtcclxuICAgICAgYXNjZW50Q2xhc3M6ICdzdC1zb3J0LWFzY2VudCcsXHJcbiAgICAgIGRlc2NlbnRDbGFzczogJ3N0LXNvcnQtZGVzY2VudCcsXHJcbiAgICAgIHNraXBOYXR1cmFsOiBmYWxzZVxyXG4gICAgfSxcclxuICAgIHBpcGU6IHtcclxuICAgICAgZGVsYXk6IDEwMCAvL21zXHJcbiAgICB9LFxyXG4gICAgc2VhcmNoVHlwZToge1xyXG4gICAgICBzZXJ2ZXI6IHRydWVcclxuICAgIH1cclxuICB9KTsiLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcclxuICAuY29udHJvbGxlcignc3RUYWJsZUNvbnRyb2xsZXInLCBbJyRzY29wZScsICckcGFyc2UnLCAnJGZpbHRlcicsICckYXR0cnMnLCAnc3RDb25maWcnLCBmdW5jdGlvbiBTdFRhYmxlQ29udHJvbGxlciAoJHNjb3BlLCAkcGFyc2UsICRmaWx0ZXIsICRhdHRycywgc3RDb25maWcpIHtcclxuICAgIHZhciBwcm9wZXJ0eU5hbWUgPSAkYXR0cnMuc3RUYWJsZTtcclxuICAgIHZhciBsb2NhbFNlYXJjaCA9ICRhdHRycy5sb2NhbFNlYXJjaCA9PSd0cnVlJyB8fCBmYWxzZTtcclxuICAgIHZhciBkaXNwbGF5R2V0dGVyID0gJHBhcnNlKHByb3BlcnR5TmFtZSk7XHJcbiAgICB2YXIgZGlzcGxheVNldHRlciA9IGRpc3BsYXlHZXR0ZXIuYXNzaWduO1xyXG4gICAgdmFyIHNhZmVHZXR0ZXI7XHJcbiAgICB2YXIgb3JkZXJCeSA9ICRmaWx0ZXIoJ29yZGVyQnknKTtcclxuICAgIHZhciBmaWx0ZXIgPSAkZmlsdGVyKCdmaWx0ZXInKTtcclxuICAgIHZhciBzYWZlQ29weSA9IGNvcHlSZWZzKGRpc3BsYXlHZXR0ZXIoJHNjb3BlKSk7XHJcbiAgICB2YXIgdGFibGVTdGF0ZSA9IHtcclxuICAgICAgc29ydDoge30sXHJcbiAgICAgIHNlYXJjaDoge30sXHJcbiAgICAgIHBhZ2luYXRpb246IHtcclxuICAgICAgICBzdGFydDogMFxyXG4gICAgICB9LFxyXG4gICAgICBjb2x1bW5zOiBbXVxyXG4gICAgfTtcclxuICAgIHZhciBmaWx0ZXJlZDtcclxuICAgIHZhciBwaXBlQWZ0ZXJTYWZlQ29weSA9IHRydWU7XHJcbiAgICB2YXIgY3RybCA9IHRoaXM7XHJcbiAgICB2YXIgbGFzdFNlbGVjdGVkO1xyXG4gICAgdmFyIGVsZW1lbnRzID0ge2NvdW50OiAwfTtcclxuXHJcbiAgICBmdW5jdGlvbiBjb3B5UmVmcyAoc3JjKSB7XHJcbiAgICAgIHJldHVybiBzcmMgPyBbXS5jb25jYXQoc3JjKSA6IFtdO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHVwZGF0ZVNhZmVDb3B5ICgpIHtcclxuICAgICAgc2FmZUNvcHkgPSBjb3B5UmVmcyhzYWZlR2V0dGVyKCRzY29wZSkpO1xyXG4gICAgICBpZiAocGlwZUFmdGVyU2FmZUNvcHkgPT09IHRydWUpIHtcclxuICAgICAgICBjdHJsLnBpcGUoKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICgkYXR0cnMuc3RTYWZlU3JjKSB7XHJcbiAgICAgIHNhZmVHZXR0ZXIgPSAkcGFyc2UoJGF0dHJzLnN0U2FmZVNyYyk7XHJcbiAgICAgICRzY29wZS4kd2F0Y2goZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIHZhciBzYWZlU3JjID0gc2FmZUdldHRlcigkc2NvcGUpO1xyXG4gICAgICAgIHJldHVybiBzYWZlU3JjID8gc2FmZVNyYy5sZW5ndGggOiAwO1xyXG5cclxuICAgICAgfSwgZnVuY3Rpb24gKG5ld1ZhbHVlLCBvbGRWYWx1ZSkge1xyXG4gICAgICAgIGlmIChuZXdWYWx1ZSAhPT0gc2FmZUNvcHkubGVuZ3RoKSB7XHJcbiAgICAgICAgICB1cGRhdGVTYWZlQ29weSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICAgICRzY29wZS4kd2F0Y2goZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIHJldHVybiBzYWZlR2V0dGVyKCRzY29wZSk7XHJcbiAgICAgIH0sIGZ1bmN0aW9uIChuZXdWYWx1ZSwgb2xkVmFsdWUpIHtcclxuICAgICAgICBpZiAobmV3VmFsdWUgIT09IG9sZFZhbHVlKSB7XHJcbiAgICAgICAgICB1cGRhdGVTYWZlQ29weSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBzb3J0IHRoZSByb3dzXHJcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9uIHwgU3RyaW5nfSBwcmVkaWNhdGUgLSBmdW5jdGlvbiBvciBzdHJpbmcgd2hpY2ggd2lsbCBiZSB1c2VkIGFzIHByZWRpY2F0ZSBmb3IgdGhlIHNvcnRpbmdcclxuICAgICAqIEBwYXJhbSBbcmV2ZXJzZV0gLSBpZiB5b3Ugd2FudCB0byByZXZlcnNlIHRoZSBvcmRlclxyXG4gICAgICovXHJcbiAgICB0aGlzLnNvcnRCeSA9IGZ1bmN0aW9uIHNvcnRCeSAocHJlZGljYXRlLCByZXZlcnNlKSB7XHJcbiAgICAgIHRhYmxlU3RhdGUuc29ydC5wcmVkaWNhdGUgPSBwcmVkaWNhdGU7XHJcbiAgICAgIHRhYmxlU3RhdGUuc29ydC5yZXZlcnNlID0gcmV2ZXJzZSA9PT0gdHJ1ZTtcclxuXHJcbiAgICAgIGlmIChuZy5pc0Z1bmN0aW9uKHByZWRpY2F0ZSkpIHtcclxuICAgICAgICB0YWJsZVN0YXRlLnNvcnQuZnVuY3Rpb25OYW1lID0gcHJlZGljYXRlLm5hbWU7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZGVsZXRlIHRhYmxlU3RhdGUuc29ydC5mdW5jdGlvbk5hbWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRhYmxlU3RhdGUucGFnaW5hdGlvbi5zdGFydCA9IDA7XHJcbiAgICAgIHJldHVybiB0aGlzLnBpcGUoKTtcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBzZWFyY2ggbWF0Y2hpbmcgcm93c1xyXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IC0gdGhlIGlucHV0IHN0cmluZ1xyXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IFtwcmVkaWNhdGVdIC0gdGhlIHByb3BlcnR5IG5hbWUgYWdhaW5zdCB5b3Ugd2FudCB0byBjaGVjayB0aGUgbWF0Y2gsIG90aGVyd2lzZSBpdCB3aWxsIHNlYXJjaCBvbiBhbGwgcHJvcGVydGllc1xyXG4gICAgICovXHJcbiAgICB0aGlzLnNlYXJjaCA9IGZ1bmN0aW9uIHNlYXJjaCAoaW5wdXQsIHByZWRpY2F0ZSkge1xyXG4gICAgICB2YXIgcHJlZGljYXRlT2JqZWN0ID0gdGFibGVTdGF0ZS5zZWFyY2gucHJlZGljYXRlT2JqZWN0IHx8IHt9O1xyXG4gICAgICB2YXIgcHJvcCA9IHByZWRpY2F0ZSA/IHByZWRpY2F0ZSA6ICckJztcclxuXHJcbiAgICAgIGlucHV0ID0gbmcuaXNTdHJpbmcoaW5wdXQpID8gaW5wdXQudHJpbSgpIDogaW5wdXQ7XHJcbiAgICAgIHByZWRpY2F0ZU9iamVjdFtwcm9wXSA9IGlucHV0O1xyXG4gICAgICAvLyB0byBhdm9pZCB0byBmaWx0ZXIgb3V0IG51bGwgdmFsdWVcclxuICAgICAgaWYgKCFpbnB1dCkge1xyXG4gICAgICAgIGRlbGV0ZSBwcmVkaWNhdGVPYmplY3RbcHJvcF07XHJcbiAgICAgIH1cclxuICAgICAgdGFibGVTdGF0ZS5zZWFyY2gucHJlZGljYXRlT2JqZWN0ID0gcHJlZGljYXRlT2JqZWN0O1xyXG4gICAgICB0YWJsZVN0YXRlLnBhZ2luYXRpb24uc3RhcnQgPSAwO1xyXG4gICAgICByZXR1cm4gdGhpcy5waXBlKCk7XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogdGhpcyB3aWxsIGNoYWluIHRoZSBvcGVyYXRpb25zIG9mIHNvcnRpbmcgYW5kIGZpbHRlcmluZyBiYXNlZCBvbiB0aGUgY3VycmVudCB0YWJsZSBzdGF0ZSAoc29ydCBvcHRpb25zLCBmaWx0ZXJpbmcsIGVjdClcclxuICAgICAqL1xyXG4gICAgdGhpcy5waXBlID0gZnVuY3Rpb24gcGlwZSAoKSB7XHJcbiAgICAgIGlmKGxvY2FsU2VhcmNoKSB7XHJcbiAgICAgICAgdGhpcy5sb2NhbFNlYXJjaCgpO1xyXG4gICAgICB9XHJcbiAgICAgIGVsc2Uge1xyXG4gICAgICAgIHRoaXMuc2VydmVyU2VhcmNoKCk7XHJcbiAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5zZXJ2ZXJTZWFyY2ggPSBmdW5jdGlvbiBzZXJ2ZXJTZWFyY2goKSB7XHJcbiAgICAgIHZhciBzZWxmID0gdGhpcztcclxuICAgICAgdmFyIHBhZ2luYXRpb24gPSB0YWJsZVN0YXRlLnBhZ2luYXRpb247XHJcbiAgICAgIHZhciBwYXJhbXMgPSB7XHJcbiAgICAgICAgb3JkZXJCeTogdGFibGVTdGF0ZS5zb3J0LnByZWRpY2F0ZSxcclxuICAgICAgICByZXZlcnNlOiB0YWJsZVN0YXRlLnNvcnQucmV2ZXJzZSxcclxuICAgICAgICBmaWx0ZXI6IHRhYmxlU3RhdGUuc2VhcmNoLnByZWRpY2F0ZU9iamVjdD8gdGFibGVTdGF0ZS5zZWFyY2gucHJlZGljYXRlT2JqZWN0LiQgOiB1bmRlZmluZWQsXHJcbiAgICAgICAgb2Zmc2V0OiBwYWdpbmF0aW9uLnN0YXJ0LFxyXG4gICAgICAgIHBhZ2VTaXplOiBwYWdpbmF0aW9uLm51bWJlcixcclxuICAgICAgICBjb2x1bW5zOiB0YWJsZVN0YXRlLmNvbHVtbnNcclxuICAgICAgfTtcclxuXHJcbiAgICAgICRzY29wZVskYXR0cnMuc3RTZWFyY2hGbl0ocGFyYW1zKS50aGVuKGZ1bmN0aW9uIChyZXMpIHtcclxuICAgICAgICBlbGVtZW50cy5jb3VudCA9IHJlc1swXS5sZW5ndGg7XHJcbiAgICAgICAgZmlsdGVyZWQgPSByZXNbMF0uY29sbGVjdGlvbjtcclxuICAgICAgICB2YXIgb3V0cHV0ID0gc2VsZi5wYWdpbmF0ZShwYWdpbmF0aW9uLCByZXNbMF0ubGVuZ3RoKTtcclxuICAgICAgICBpZihwYXJhbXMub2Zmc2V0ID09IHBhZ2luYXRpb24uc3RhcnQpe1xyXG4gICAgICAgICAgZGlzcGxheVNldHRlcigkc2NvcGUsIG91dHB1dCB8fCBmaWx0ZXJlZCk7XHJcbiAgICAgICAgfSBlbHNle1xyXG4gICAgICAgICAgcGFyYW1zLm9mZnNldCA9IHBhZ2luYXRpb24uc3RhcnQ7XHJcbiAgICAgICAgICAkc2NvcGVbJGF0dHJzLnN0U2VhcmNoRm5dKHBhcmFtcykudGhlbihmdW5jdGlvbiAocmVzKXtcclxuICAgICAgICAgICAgZmlsdGVyZWQgPSByZXNbMF0uY29sbGVjdGlvbjtcclxuICAgICAgICAgICAgZGlzcGxheVNldHRlcigkc2NvcGUsIGZpbHRlcmVkKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5sb2NhbFNlYXJjaCA9IGZ1bmN0aW9uIGxvY2FsU2VhcmNoKCkge1xyXG4gICAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICAgIHZhciBwYWdpbmF0aW9uID0gdGFibGVTdGF0ZS5wYWdpbmF0aW9uO1xyXG4gICAgICBmaWx0ZXJlZCA9IHRhYmxlU3RhdGUuc2VhcmNoLnByZWRpY2F0ZU9iamVjdCA/IGZpbHRlcihzYWZlQ29weSwgdGFibGVTdGF0ZS5zZWFyY2gucHJlZGljYXRlT2JqZWN0KSA6IHNhZmVDb3B5O1xyXG4gICAgICBpZiAodGFibGVTdGF0ZS5zb3J0LnByZWRpY2F0ZSkge1xyXG4gICAgICAgIGZpbHRlcmVkID0gb3JkZXJCeShmaWx0ZXJlZCwgdGFibGVTdGF0ZS5zb3J0LnByZWRpY2F0ZSwgdGFibGVTdGF0ZS5zb3J0LnJldmVyc2UpO1xyXG4gICAgICB9XHJcbiAgICAgIHZhciBvdXRwdXQgPSBzZWxmLnBhZ2luYXRlKHBhZ2luYXRpb24sIGZpbHRlcmVkLmxlbmd0aCk7XHJcbiAgICAgIGRpc3BsYXlTZXR0ZXIoJHNjb3BlLCBvdXRwdXQgfHwgZmlsdGVyZWQpO1xyXG4gICAgICBlbGVtZW50cy5jb3VudCA9IHNhZmVDb3B5Lmxlbmd0aDtcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5wYWdpbmF0ZSA9IGZ1bmN0aW9uIHBhZ2luYXRlIChwYWdpbmF0aW9uLCBjb2xsZWN0aW9uTGVuZ3RoKSB7XHJcbiAgICAgIGlmIChwYWdpbmF0aW9uLm51bWJlciAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgcGFnaW5hdGlvbi5udW1iZXJPZlBhZ2VzID0gY29sbGVjdGlvbkxlbmd0aCA+IDAgPyBNYXRoLmNlaWwoY29sbGVjdGlvbkxlbmd0aCAvIHBhZ2luYXRpb24ubnVtYmVyKSA6IDE7XHJcbiAgICAgICAgcGFnaW5hdGlvbi5zdGFydCA9IHBhZ2luYXRpb24uc3RhcnQgPj0gY29sbGVjdGlvbkxlbmd0aCA/IChwYWdpbmF0aW9uLm51bWJlck9mUGFnZXMgLSAxKSAqIHBhZ2luYXRpb24ubnVtYmVyIDogcGFnaW5hdGlvbi5zdGFydDtcclxuICAgICAgICBpZihsb2NhbFNlYXJjaCl7XHJcbiAgICAgICAgICByZXR1cm4gZmlsdGVyZWQuc2xpY2UocGFnaW5hdGlvbi5zdGFydCwgcGFnaW5hdGlvbi5zdGFydCArIHBhZ2luYXRpb24ubnVtYmVyKTtcclxuICAgICAgICB9IGVsc2V7XHJcbiAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIFtdO1xyXG4gICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogc2VsZWN0IGEgZGF0YVJvdyAoaXQgd2lsbCBhZGQgdGhlIGF0dHJpYnV0ZSBpc1NlbGVjdGVkIHRvIHRoZSByb3cgb2JqZWN0KVxyXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHJvdyAtIHRoZSByb3cgdG8gc2VsZWN0XHJcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gW21vZGVdIC0gXCJzaW5nbGVcIiBvciBcIm11bHRpcGxlXCIgKG11bHRpcGxlIGJ5IGRlZmF1bHQpXHJcbiAgICAgKi9cclxuICAgIHRoaXMuc2VsZWN0ID0gZnVuY3Rpb24gc2VsZWN0IChyb3csIG1vZGUpIHtcclxuICAgICAgdmFyIHJvd3MgPSBjb3B5UmVmcyhkaXNwbGF5R2V0dGVyKCRzY29wZSkpO1xyXG4gICAgICB2YXIgaW5kZXggPSByb3dzLmluZGV4T2Yocm93KTtcclxuICAgICAgaWYgKGluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgIGlmIChtb2RlID09PSAnc2luZ2xlJykge1xyXG4gICAgICAgICAgcm93LmlzU2VsZWN0ZWQgPSByb3cuaXNTZWxlY3RlZCAhPT0gdHJ1ZTtcclxuICAgICAgICAgIGlmIChsYXN0U2VsZWN0ZWQpIHtcclxuICAgICAgICAgICAgbGFzdFNlbGVjdGVkLmlzU2VsZWN0ZWQgPSBmYWxzZTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGxhc3RTZWxlY3RlZCA9IHJvdy5pc1NlbGVjdGVkID09PSB0cnVlID8gcm93IDogdW5kZWZpbmVkO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICByb3dzW2luZGV4XS5pc1NlbGVjdGVkID0gIXJvd3NbaW5kZXhdLmlzU2VsZWN0ZWQ7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogdGFrZSBhIHNsaWNlIG9mIHRoZSBjdXJyZW50IHNvcnRlZC9maWx0ZXJlZCBjb2xsZWN0aW9uIChwYWdpbmF0aW9uKVxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzdGFydCAtIHN0YXJ0IGluZGV4IG9mIHRoZSBzbGljZVxyXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IG51bWJlciAtIHRoZSBudW1iZXIgb2YgaXRlbSBpbiB0aGUgc2xpY2VcclxuICAgICAqL1xyXG4gICAgdGhpcy5zbGljZSA9IGZ1bmN0aW9uIHNwbGljZSAoc3RhcnQsIG51bWJlcikge1xyXG4gICAgICB0YWJsZVN0YXRlLnBhZ2luYXRpb24uc3RhcnQgPSBzdGFydDtcclxuICAgICAgdGFibGVTdGF0ZS5wYWdpbmF0aW9uLm51bWJlciA9IG51bWJlcjtcclxuICAgICAgcmV0dXJuIHRoaXMucGlwZSgpO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIHJldHVybiB0aGUgY3VycmVudCBzdGF0ZSBvZiB0aGUgdGFibGVcclxuICAgICAqIEByZXR1cm5zIHt7c29ydDoge30sIHNlYXJjaDoge30sIHBhZ2luYXRpb246IHtzdGFydDogbnVtYmVyfX19XHJcbiAgICAgKi9cclxuICAgIHRoaXMudGFibGVTdGF0ZSA9IGZ1bmN0aW9uIGdldFRhYmxlU3RhdGUgKCkge1xyXG4gICAgICByZXR1cm4gdGFibGVTdGF0ZTtcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5nZXRGaWx0ZXJlZENvbGxlY3Rpb24gPSBmdW5jdGlvbiBnZXRGaWx0ZXJlZENvbGxlY3Rpb24gKCkge1xyXG4gICAgICByZXR1cm4gZmlsdGVyZWQgfHwgc2FmZUNvcHk7XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXNlIGEgZGlmZmVyZW50IGZpbHRlciBmdW5jdGlvbiB0aGFuIHRoZSBhbmd1bGFyIEZpbHRlckZpbHRlclxyXG4gICAgICogQHBhcmFtIGZpbHRlck5hbWUgdGhlIG5hbWUgdW5kZXIgd2hpY2ggdGhlIGN1c3RvbSBmaWx0ZXIgaXMgcmVnaXN0ZXJlZFxyXG4gICAgICovXHJcbiAgICB0aGlzLnNldEZpbHRlckZ1bmN0aW9uID0gZnVuY3Rpb24gc2V0RmlsdGVyRnVuY3Rpb24gKGZpbHRlck5hbWUpIHtcclxuICAgICAgZmlsdGVyID0gJGZpbHRlcihmaWx0ZXJOYW1lKTtcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVc2UgYSBkaWZmZXJlbnQgZnVuY3Rpb24gdGhhbiB0aGUgYW5ndWxhciBvcmRlckJ5XHJcbiAgICAgKiBAcGFyYW0gc29ydEZ1bmN0aW9uTmFtZSB0aGUgbmFtZSB1bmRlciB3aGljaCB0aGUgY3VzdG9tIG9yZGVyIGZ1bmN0aW9uIGlzIHJlZ2lzdGVyZWRcclxuICAgICAqL1xyXG4gICAgdGhpcy5zZXRTb3J0RnVuY3Rpb24gPSBmdW5jdGlvbiBzZXRTb3J0RnVuY3Rpb24gKHNvcnRGdW5jdGlvbk5hbWUpIHtcclxuICAgICAgb3JkZXJCeSA9ICRmaWx0ZXIoc29ydEZ1bmN0aW9uTmFtZSk7XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXN1YWxseSB3aGVuIHRoZSBzYWZlIGNvcHkgaXMgdXBkYXRlZCB0aGUgcGlwZSBmdW5jdGlvbiBpcyBjYWxsZWQuXHJcbiAgICAgKiBDYWxsaW5nIHRoaXMgbWV0aG9kIHdpbGwgcHJldmVudCBpdCwgd2hpY2ggaXMgc29tZXRoaW5nIHJlcXVpcmVkIHdoZW4gdXNpbmcgYSBjdXN0b20gcGlwZSBmdW5jdGlvblxyXG4gICAgICovXHJcbiAgICB0aGlzLnByZXZlbnRQaXBlT25XYXRjaCA9IGZ1bmN0aW9uIHByZXZlbnRQaXBlICgpIHtcclxuICAgICAgcGlwZUFmdGVyU2FmZUNvcHkgPSBmYWxzZTtcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5nZXRFbGVtZW50cyA9IGZ1bmN0aW9uIGdldEVsZW1lbnRzKCkge1xyXG4gICAgICByZXR1cm4gZWxlbWVudHM7XHJcbiAgICB9O1xyXG5cclxuICB9XSlcclxuICAuZGlyZWN0aXZlKCdzdFRhYmxlJywgZnVuY3Rpb24gKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgcmVzdHJpY3Q6ICdBJyxcclxuICAgICAgY29udHJvbGxlcjogJ3N0VGFibGVDb250cm9sbGVyJyxcclxuICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50LCBhdHRyLCBjdHJsKSB7XHJcblxyXG4gICAgICAgIGlmIChhdHRyLnN0U2V0RmlsdGVyKSB7XHJcbiAgICAgICAgICBjdHJsLnNldEZpbHRlckZ1bmN0aW9uKGF0dHIuc3RTZXRGaWx0ZXIpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGF0dHIuc3RTZXRTb3J0KSB7XHJcbiAgICAgICAgICBjdHJsLnNldFNvcnRGdW5jdGlvbihhdHRyLnN0U2V0U29ydCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9O1xyXG4gIH0pO1xyXG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcclxuICAuZGlyZWN0aXZlKCdzdFNlYXJjaCcsIFsnc3RDb25maWcnLCAnJHRpbWVvdXQnLCBmdW5jdGlvbiAoc3RDb25maWcsICR0aW1lb3V0KSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICByZXF1aXJlOiAnXnN0VGFibGUnLFxyXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcclxuICAgICAgICB2YXIgdGFibGVDdHJsID0gY3RybDtcclxuICAgICAgICB2YXIgcHJvbWlzZSA9IG51bGw7XHJcbiAgICAgICAgdmFyIHRocm90dGxlID0gYXR0ci5zdERlbGF5IHx8IHN0Q29uZmlnLnNlYXJjaC5kZWxheTtcclxuXHJcbiAgICAgICAgYXR0ci4kb2JzZXJ2ZSgnc3RTZWFyY2gnLCBmdW5jdGlvbiAobmV3VmFsdWUsIG9sZFZhbHVlKSB7XHJcbiAgICAgICAgICB2YXIgaW5wdXQgPSBlbGVtZW50WzBdLnZhbHVlO1xyXG4gICAgICAgICAgaWYgKG5ld1ZhbHVlICE9PSBvbGRWYWx1ZSAmJiBpbnB1dCkge1xyXG4gICAgICAgICAgICBjdHJsLnRhYmxlU3RhdGUoKS5zZWFyY2ggPSB7fTtcclxuICAgICAgICAgICAgdGFibGVDdHJsLnNlYXJjaChpbnB1dCwgbmV3VmFsdWUpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvL3RhYmxlIHN0YXRlIC0+IHZpZXdcclxuICAgICAgICBzY29wZS4kd2F0Y2goZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgcmV0dXJuIGN0cmwudGFibGVTdGF0ZSgpLnNlYXJjaDtcclxuICAgICAgICB9LCBmdW5jdGlvbiAobmV3VmFsdWUsIG9sZFZhbHVlKSB7XHJcbiAgICAgICAgICB2YXIgcHJlZGljYXRlRXhwcmVzc2lvbiA9IGF0dHIuc3RTZWFyY2ggfHwgJyQnO1xyXG4gICAgICAgICAgaWYgKG5ld1ZhbHVlLnByZWRpY2F0ZU9iamVjdCAmJiBuZXdWYWx1ZS5wcmVkaWNhdGVPYmplY3RbcHJlZGljYXRlRXhwcmVzc2lvbl0gIT09IGVsZW1lbnRbMF0udmFsdWUpIHtcclxuICAgICAgICAgICAgZWxlbWVudFswXS52YWx1ZSA9IG5ld1ZhbHVlLnByZWRpY2F0ZU9iamVjdFtwcmVkaWNhdGVFeHByZXNzaW9uXSB8fCAnJztcclxuICAgICAgICAgIH1cclxuICAgICAgICB9LCB0cnVlKTtcclxuXHJcbiAgICAgICAgLy8gdmlldyAtPiB0YWJsZSBzdGF0ZVxyXG4gICAgICAgIGVsZW1lbnQuYmluZCgnaW5wdXQnLCBmdW5jdGlvbiAoZXZ0KSB7XHJcbiAgICAgICAgICBldnQgPSBldnQub3JpZ2luYWxFdmVudCB8fCBldnQ7XHJcbiAgICAgICAgICBpZiAocHJvbWlzZSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAkdGltZW91dC5jYW5jZWwocHJvbWlzZSk7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgcHJvbWlzZSA9ICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgdGFibGVDdHJsLnNlYXJjaChldnQudGFyZ2V0LnZhbHVlLCBhdHRyLnN0U2VhcmNoIHx8ICcnKTtcclxuICAgICAgICAgICAgcHJvbWlzZSA9IG51bGw7XHJcbiAgICAgICAgICB9LCB0aHJvdHRsZSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH07XHJcbiAgfV0pO1xyXG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcclxuICAuZGlyZWN0aXZlKCdzdFNlYXJjaEJ1dHRvbicsIFsnc3RDb25maWcnLCAnJHRpbWVvdXQnLCBmdW5jdGlvbiAoc3RDb25maWcsICR0aW1lb3V0KSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICByZXF1aXJlOiAnXnN0VGFibGUnLFxyXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcclxuICAgICAgICBlbGVtZW50LmJpbmQoJ2NsaWNrJywgZnVuY3Rpb24gKGV2dCkge1xyXG4gICAgICAgICAgaWYoYXR0ci50eXBlID09ICdidXR0b24nKXtcclxuICAgICAgICAgICAgY3RybC5waXBlKCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH07XHJcbiAgfV0pO1xyXG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcclxuICAuZGlyZWN0aXZlKCdzdFNlbGVjdFJvdycsIFsnc3RDb25maWcnLCBmdW5jdGlvbiAoc3RDb25maWcpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHJlc3RyaWN0OiAnQScsXHJcbiAgICAgIHJlcXVpcmU6ICdec3RUYWJsZScsXHJcbiAgICAgIHNjb3BlOiB7XHJcbiAgICAgICAgcm93OiAnPXN0U2VsZWN0Um93J1xyXG4gICAgICB9LFxyXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcclxuICAgICAgICB2YXIgbW9kZSA9IGF0dHIuc3RTZWxlY3RNb2RlIHx8IHN0Q29uZmlnLnNlbGVjdC5tb2RlO1xyXG4gICAgICAgIGVsZW1lbnQuYmluZCgnY2xpY2snLCBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICBzY29wZS4kYXBwbHkoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICBjdHJsLnNlbGVjdChzY29wZS5yb3csIG1vZGUpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHNjb3BlLiR3YXRjaCgncm93LmlzU2VsZWN0ZWQnLCBmdW5jdGlvbiAobmV3VmFsdWUpIHtcclxuICAgICAgICAgIGlmIChuZXdWYWx1ZSA9PT0gdHJ1ZSkge1xyXG4gICAgICAgICAgICBlbGVtZW50LmFkZENsYXNzKHN0Q29uZmlnLnNlbGVjdC5zZWxlY3RlZENsYXNzKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGVsZW1lbnQucmVtb3ZlQ2xhc3Moc3RDb25maWcuc2VsZWN0LnNlbGVjdGVkQ2xhc3MpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9O1xyXG4gIH1dKTtcclxuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXHJcbiAgLmRpcmVjdGl2ZSgnc3RTb3J0JywgWydzdENvbmZpZycsICckcGFyc2UnLCBmdW5jdGlvbiAoc3RDb25maWcsICRwYXJzZSkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgcmVzdHJpY3Q6ICdBJyxcclxuICAgICAgcmVxdWlyZTogJ15zdFRhYmxlJyxcclxuICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50LCBhdHRyLCBjdHJsKSB7XHJcblxyXG4gICAgICAgIHZhciBwcmVkaWNhdGUgPSBhdHRyLnN0U29ydDtcclxuICAgICAgICB2YXIgZ2V0dGVyID0gJHBhcnNlKHByZWRpY2F0ZSk7XHJcbiAgICAgICAgdmFyIGluZGV4ID0gMDtcclxuICAgICAgICB2YXIgY2xhc3NBc2NlbnQgPSBhdHRyLnN0Q2xhc3NBc2NlbnQgfHwgc3RDb25maWcuc29ydC5hc2NlbnRDbGFzcztcclxuICAgICAgICB2YXIgY2xhc3NEZXNjZW50ID0gYXR0ci5zdENsYXNzRGVzY2VudCB8fCBzdENvbmZpZy5zb3J0LmRlc2NlbnRDbGFzcztcclxuICAgICAgICB2YXIgc3RhdGVDbGFzc2VzID0gW2NsYXNzQXNjZW50LCBjbGFzc0Rlc2NlbnRdO1xyXG4gICAgICAgIHZhciBzb3J0RGVmYXVsdDtcclxuICAgICAgICB2YXIgc2tpcE5hdHVyYWwgPSBhdHRyLnN0U2tpcE5hdHVyYWwgIT09IHVuZGVmaW5lZCA/IGF0dHIuc3RTa2lwTmF0dXJhbCA6IHN0Q29uZmlnLnNraXBOYXR1cmFsO1xyXG5cclxuICAgICAgICBpZiAoYXR0ci5zdFNvcnREZWZhdWx0KSB7XHJcbiAgICAgICAgICBzb3J0RGVmYXVsdCA9IHNjb3BlLiRldmFsKGF0dHIuc3RTb3J0RGVmYXVsdCkgIT09IHVuZGVmaW5lZCA/IHNjb3BlLiRldmFsKGF0dHIuc3RTb3J0RGVmYXVsdCkgOiBhdHRyLnN0U29ydERlZmF1bHQ7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjdHJsLnRhYmxlU3RhdGUoKS5jb2x1bW5zLnB1c2gocHJlZGljYXRlKTtcclxuXHJcbiAgICAgICAgLy92aWV3IC0tPiB0YWJsZSBzdGF0ZVxyXG4gICAgICAgIGZ1bmN0aW9uIHNvcnQgKCkge1xyXG4gICAgICAgICAgaW5kZXgrKztcclxuICAgICAgICAgIHByZWRpY2F0ZSA9IG5nLmlzRnVuY3Rpb24oZ2V0dGVyKHNjb3BlKSkgPyBnZXR0ZXIoc2NvcGUpIDogYXR0ci5zdFNvcnQ7XHJcbiAgICAgICAgICBpZiAoaW5kZXggJSAzID09PSAwICYmICEhc2tpcE5hdHVyYWwgIT09IHRydWUpIHtcclxuICAgICAgICAgICAgLy9tYW51YWwgcmVzZXRcclxuICAgICAgICAgICAgaW5kZXggPSAwO1xyXG4gICAgICAgICAgICBjdHJsLnRhYmxlU3RhdGUoKS5zb3J0ID0ge307XHJcbiAgICAgICAgICAgIGN0cmwudGFibGVTdGF0ZSgpLnBhZ2luYXRpb24uc3RhcnQgPSAwO1xyXG4gICAgICAgICAgICBjdHJsLnBpcGUoKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGN0cmwuc29ydEJ5KHByZWRpY2F0ZSwgaW5kZXggJSAyID09PSAwKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGVsZW1lbnQuYmluZCgnY2xpY2snLCBmdW5jdGlvbiBzb3J0Q2xpY2sgKCkge1xyXG4gICAgICAgICAgaWYgKHByZWRpY2F0ZSkge1xyXG4gICAgICAgICAgICBzY29wZS4kYXBwbHkoc29ydCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmIChzb3J0RGVmYXVsdCkge1xyXG4gICAgICAgICAgaW5kZXggPSBzb3J0RGVmYXVsdCA9PT0gJ3JldmVyc2UnID8gMSA6IDA7XHJcbiAgICAgICAgICBzb3J0KCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvL3RhYmxlIHN0YXRlIC0tPiB2aWV3XHJcbiAgICAgICAgc2NvcGUuJHdhdGNoKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgIHJldHVybiBjdHJsLnRhYmxlU3RhdGUoKS5zb3J0O1xyXG4gICAgICAgIH0sIGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xyXG4gICAgICAgICAgaWYgKG5ld1ZhbHVlLnByZWRpY2F0ZSAhPT0gcHJlZGljYXRlKSB7XHJcbiAgICAgICAgICAgIGluZGV4ID0gMDtcclxuICAgICAgICAgICAgZWxlbWVudFxyXG4gICAgICAgICAgICAgIC5yZW1vdmVDbGFzcyhjbGFzc0FzY2VudClcclxuICAgICAgICAgICAgICAucmVtb3ZlQ2xhc3MoY2xhc3NEZXNjZW50KTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGluZGV4ID0gbmV3VmFsdWUucmV2ZXJzZSA9PT0gdHJ1ZSA/IDIgOiAxO1xyXG4gICAgICAgICAgICBlbGVtZW50XHJcbiAgICAgICAgICAgICAgLnJlbW92ZUNsYXNzKHN0YXRlQ2xhc3Nlc1tpbmRleCAlIDJdKVxyXG4gICAgICAgICAgICAgIC5hZGRDbGFzcyhzdGF0ZUNsYXNzZXNbaW5kZXggLSAxXSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSwgdHJ1ZSk7XHJcbiAgICAgIH1cclxuICAgIH07XHJcbiAgfV0pO1xyXG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcclxuICAuZGlyZWN0aXZlKCdzdFBhZ2luYXRpb24nLCBbJ3N0Q29uZmlnJywgZnVuY3Rpb24gKHN0Q29uZmlnKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICByZXN0cmljdDogJ0VBJyxcclxuICAgICAgcmVxdWlyZTogJ15zdFRhYmxlJyxcclxuICAgICAgc2NvcGU6IHtcclxuICAgICAgICBzdEl0ZW1zQnlQYWdlOiAnPT8nLFxyXG4gICAgICAgIHN0RGlzcGxheWVkUGFnZXM6ICc9PycsXHJcbiAgICAgICAgc3RQYWdlQ2hhbmdlOiAnJidcclxuICAgICAgfSxcclxuICAgICAgdGVtcGxhdGVVcmw6IGZ1bmN0aW9uIChlbGVtZW50LCBhdHRycykge1xyXG4gICAgICAgIGlmIChhdHRycy5zdFRlbXBsYXRlKSB7XHJcbiAgICAgICAgICByZXR1cm4gYXR0cnMuc3RUZW1wbGF0ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHN0Q29uZmlnLnBhZ2luYXRpb24udGVtcGxhdGU7XHJcbiAgICAgIH0sXHJcbiAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0cnMsIGN0cmwpIHtcclxuXHJcbiAgICAgICAgc2NvcGUuc3RJdGVtc0J5UGFnZSA9IHNjb3BlLnN0SXRlbXNCeVBhZ2UgPyArKHNjb3BlLnN0SXRlbXNCeVBhZ2UpIDogc3RDb25maWcucGFnaW5hdGlvbi5pdGVtc0J5UGFnZTtcclxuICAgICAgICBzY29wZS5zdERpc3BsYXllZFBhZ2VzID0gc2NvcGUuc3REaXNwbGF5ZWRQYWdlcyA/ICsoc2NvcGUuc3REaXNwbGF5ZWRQYWdlcykgOiBzdENvbmZpZy5wYWdpbmF0aW9uLmRpc3BsYXllZFBhZ2VzO1xyXG5cclxuICAgICAgICBzY29wZS5jdXJyZW50UGFnZSA9IDE7XHJcbiAgICAgICAgc2NvcGUucGFnZXMgPSBbXTtcclxuICAgICAgICBzY29wZS5lbGVtZW50cyA9IGN0cmwuZ2V0RWxlbWVudHMoKTtcclxuXHJcbiAgICAgICAgZnVuY3Rpb24gcmVkcmF3ICgpIHtcclxuICAgICAgICAgIHZhciBwYWdpbmF0aW9uU3RhdGUgPSBjdHJsLnRhYmxlU3RhdGUoKS5wYWdpbmF0aW9uO1xyXG4gICAgICAgICAgdmFyIHN0YXJ0ID0gMTtcclxuICAgICAgICAgIHZhciBlbmQ7XHJcbiAgICAgICAgICB2YXIgaTtcclxuICAgICAgICAgIHZhciBwcmV2UGFnZSA9IHNjb3BlLmN1cnJlbnRQYWdlO1xyXG4gICAgICAgICAgc2NvcGUuY3VycmVudFBhZ2UgPSBNYXRoLmZsb29yKHBhZ2luYXRpb25TdGF0ZS5zdGFydCAvIHBhZ2luYXRpb25TdGF0ZS5udW1iZXIpICsgMTtcclxuXHJcbiAgICAgICAgICBzdGFydCA9IE1hdGgubWF4KHN0YXJ0LCBzY29wZS5jdXJyZW50UGFnZSAtIE1hdGguYWJzKE1hdGguZmxvb3Ioc2NvcGUuc3REaXNwbGF5ZWRQYWdlcyAvIDIpKSk7XHJcbiAgICAgICAgICBlbmQgPSBzdGFydCArIHNjb3BlLnN0RGlzcGxheWVkUGFnZXM7XHJcblxyXG4gICAgICAgICAgaWYgKGVuZCA+IHBhZ2luYXRpb25TdGF0ZS5udW1iZXJPZlBhZ2VzKSB7XHJcbiAgICAgICAgICAgIGVuZCA9IHBhZ2luYXRpb25TdGF0ZS5udW1iZXJPZlBhZ2VzICsgMTtcclxuICAgICAgICAgICAgc3RhcnQgPSBNYXRoLm1heCgxLCBlbmQgLSBzY29wZS5zdERpc3BsYXllZFBhZ2VzKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBzY29wZS5wYWdlcyA9IFtdO1xyXG4gICAgICAgICAgc2NvcGUubnVtUGFnZXMgPSBwYWdpbmF0aW9uU3RhdGUubnVtYmVyT2ZQYWdlcztcclxuXHJcbiAgICAgICAgICBpZiAocGFnaW5hdGlvblN0YXRlLm51bWJlck9mUGFnZXMpe1xyXG4gICAgICAgICAgICBmb3IgKGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgc2NvcGUucGFnZXMucHVzaChpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmIChwcmV2UGFnZSAhPT0gc2NvcGUuY3VycmVudFBhZ2UpIHtcclxuICAgICAgICAgICAgc2NvcGUuc3RQYWdlQ2hhbmdlKHtuZXdQYWdlOiBzY29wZS5jdXJyZW50UGFnZX0pO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy90YWJsZSBzdGF0ZSAtLT4gdmlld1xyXG4gICAgICAgIHNjb3BlLiR3YXRjaChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICByZXR1cm4gY3RybC50YWJsZVN0YXRlKCkucGFnaW5hdGlvbjtcclxuICAgICAgICB9LCByZWRyYXcsIHRydWUpO1xyXG5cclxuICAgICAgICAvL3Njb3BlIC0tPiB0YWJsZSBzdGF0ZSAgKC0tPiB2aWV3KVxyXG4gICAgICAgIHNjb3BlLiR3YXRjaCgnc3RJdGVtc0J5UGFnZScsIGZ1bmN0aW9uIChuZXdWYWx1ZSwgb2xkVmFsdWUpIHtcclxuICAgICAgICAgIGlmIChuZXdWYWx1ZSAhPT0gb2xkVmFsdWUpIHtcclxuICAgICAgICAgICAgc2NvcGUuc2VsZWN0UGFnZSgxKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgc2NvcGUuJHdhdGNoKCdzdERpc3BsYXllZFBhZ2VzJywgcmVkcmF3KTtcclxuXHJcbiAgICAgICAgLy92aWV3IC0+IHRhYmxlIHN0YXRlXHJcbiAgICAgICAgc2NvcGUuc2VsZWN0UGFnZSA9IGZ1bmN0aW9uIChwYWdlKSB7XHJcbiAgICAgICAgICBpZiAocGFnZSA+IDAgJiYgcGFnZSA8PSBzY29wZS5udW1QYWdlcykge1xyXG4gICAgICAgICAgICBjdHJsLnNsaWNlKChwYWdlIC0gMSkgKiBzY29wZS5zdEl0ZW1zQnlQYWdlLCBzY29wZS5zdEl0ZW1zQnlQYWdlKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBpZiAoIWN0cmwudGFibGVTdGF0ZSgpLnBhZ2luYXRpb24ubnVtYmVyKSB7XHJcbiAgICAgICAgICBjdHJsLnNsaWNlKDAsIHNjb3BlLnN0SXRlbXNCeVBhZ2UpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfTtcclxuICB9XSk7XHJcbiIsIm5nLm1vZHVsZSgnc21hcnQtdGFibGUnKVxyXG4gIC5kaXJlY3RpdmUoJ3N0UGlwZScsIFsnc3RDb25maWcnLCAnJHRpbWVvdXQnLCBmdW5jdGlvbiAoY29uZmlnLCAkdGltZW91dCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgcmVxdWlyZTogJ3N0VGFibGUnLFxyXG4gICAgICBzY29wZToge1xyXG4gICAgICAgIHN0UGlwZTogJz0nXHJcbiAgICAgIH0sXHJcbiAgICAgIGxpbms6IHtcclxuXHJcbiAgICAgICAgcHJlOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzLCBjdHJsKSB7XHJcblxyXG4gICAgICAgICAgdmFyIHBpcGVQcm9taXNlID0gbnVsbDtcclxuXHJcbiAgICAgICAgICBpZiAobmcuaXNGdW5jdGlvbihzY29wZS5zdFBpcGUpKSB7XHJcbiAgICAgICAgICAgIGN0cmwucHJldmVudFBpcGVPbldhdGNoKCk7XHJcbiAgICAgICAgICAgIGN0cmwucGlwZSA9IGZ1bmN0aW9uICgpIHtcclxuXHJcbiAgICAgICAgICAgICAgaWYgKHBpcGVQcm9taXNlICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAkdGltZW91dC5jYW5jZWwocGlwZVByb21pc2UpXHJcbiAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICBwaXBlUHJvbWlzZSA9ICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIHNjb3BlLnN0UGlwZShjdHJsLnRhYmxlU3RhdGUoKSwgY3RybCk7XHJcbiAgICAgICAgICAgICAgfSwgY29uZmlnLnBpcGUuZGVsYXkpO1xyXG5cclxuICAgICAgICAgICAgICByZXR1cm4gcGlwZVByb21pc2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG5cclxuICAgICAgICBwb3N0OiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzLCBjdHJsKSB7XHJcbiAgICAgICAgICBjdHJsLnBpcGUoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH07XHJcbiAgfV0pO1xyXG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcclxuICAuZGlyZWN0aXZlKCdzdFJlc2V0RmlsdGVyJywgWyckcGFyc2UnLCBmdW5jdGlvbiAoJHBhcnNlKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgcmVzdHJpY3Q6ICdBJyxcclxuICAgICAgICAgICAgcmVxdWlyZTogJ15zdFRhYmxlJyxcclxuICAgICAgICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50LCBhdHRyLCBjdHJsKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgdGFibGVDdHJsID0gY3RybDtcclxuICAgICAgICAgICAgICAgIHZhciBmbiA9ICRwYXJzZShhdHRyWydzdFJlc2V0RmlsdGVyJ10pO1xyXG5cclxuICAgICAgICAgICAgICAgIGVsZW1lbnQub24oJ2NsaWNrJywgZnVuY3Rpb24gKGV2ZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY3RybC50YWJsZVN0YXRlKCkuc2VhcmNoID0ge307XHJcbiAgICAgICAgICAgICAgICAgICAgdGFibGVDdHJsLnNlYXJjaCgnJywgJycpO1xyXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLiRhcHBseShmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZuKHNjb3BlLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAkZXZlbnQ6IGV2ZW50XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgfV0pOyIsIn0pKGFuZ3VsYXIpOyJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==